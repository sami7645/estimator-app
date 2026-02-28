"""
Fast ML detection engine for construction floor-plan takeoffs.

Toggle.ai-style approach: analyse the TARGET image only using CV, then use
the global dataset *metadata* (geometry patterns, sizes, angles) to guide
and filter what we find. No source-image loading = instant results.

Pipeline (< 2 seconds on any floor plan):
1. Load target image once, downsample to working resolution.
2. Pre-compute edge map, line map, contour map.
3. For each count type present in the dataset:
   • each   → blob / corner detection at locations matching dataset density
   • linear → Hough lines filtered by dataset angle & length patterns
   • area   → contour detection filtered by dataset size & shape patterns
4. NMS, confidence scoring, return normalised coordinates.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from django.conf import settings

logger = logging.getLogger(__name__)

WORK_SIZE = 1200  # max dimension for processing — keeps everything fast


@dataclass
class DetectedItem:
    geometry: list[list[float]]
    geometry_type: str
    count_type: str
    confidence: float = 0.0
    area_sqft: float | None = None
    perimeter_ft: float | None = None
    length_ft: float | None = None
    rotation_deg: float = 0.0
    source_color: str = ""
    source_shape: str = ""
    # Optional link back to the specific dataset
    # CountDefinition this detection was generated from,
    # so the caller can keep different dataset "count
    # types" fully separate when creating CountDefinitions.
    source_def_id: int | None = None
    source_def_name: str = ""


def _resolve_image_path(image_field) -> Path | None:
    if not image_field or not image_field.name:
        return None
    p = Path(settings.MEDIA_ROOT) / image_field.name
    return p if p.exists() else None


def _nms_points(dets: list[DetectedItem], radius: float = 0.025) -> list[DetectedItem]:
    dets.sort(key=lambda d: d.confidence, reverse=True)
    kept: list[DetectedItem] = []
    for d in dets:
        x, y = d.geometry[0]
        if not any(abs(x - k.geometry[0][0]) < radius and abs(y - k.geometry[0][1]) < radius for k in kept):
            kept.append(d)
    return kept


def _nms_lines(dets: list[DetectedItem], radius: float = 0.03) -> list[DetectedItem]:
    dets.sort(key=lambda d: d.confidence, reverse=True)
    kept: list[DetectedItem] = []
    for d in dets:
        mx = (d.geometry[0][0] + d.geometry[-1][0]) / 2
        my = (d.geometry[0][1] + d.geometry[-1][1]) / 2
        if not any(
            abs(mx - (k.geometry[0][0] + k.geometry[-1][0]) / 2) < radius and
            abs(my - (k.geometry[0][1] + k.geometry[-1][1]) / 2) < radius
            for k in kept
        ):
            kept.append(d)
    return kept


def _nms_areas(dets: list[DetectedItem], iou_thresh: float = 0.3) -> list[DetectedItem]:
    def bbox(g):
        xs = [p[0] for p in g]; ys = [p[1] for p in g]
        return min(xs), min(ys), max(xs), max(ys)
    def iou(a, b):
        ix0, iy0, ix1, iy1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
        inter = max(0, ix1 - ix0) * max(0, iy1 - iy0)
        union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
        return inter / union if union > 0 else 0
    dets.sort(key=lambda d: d.confidence, reverse=True)
    kept: list[DetectedItem] = []
    for d in dets:
        b = bbox(d.geometry)
        if not any(iou(b, bbox(k.geometry)) > iou_thresh for k in kept):
            kept.append(d)
    return kept


# ─────────────────────────────────────────────────────────────────────────────

class FastDetector:
    """Analyses target floor-plan at reduced resolution."""

    def __init__(self, image_path: Path):
        raw = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
        if raw is None:
            raise FileNotFoundError(image_path)
        oh, ow = raw.shape[:2]
        self.orig_h, self.orig_w = oh, ow

        scale = min(WORK_SIZE / max(oh, ow), 1.0)
        self.scale = scale
        if scale < 1.0:
            self.gray = cv2.resize(raw, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        else:
            self.gray = raw
        self.h, self.w = self.gray.shape[:2]

        blurred = cv2.GaussianBlur(self.gray, (5, 5), 0)
        self.edges = cv2.Canny(blurred, 50, 150)

    # ── Points / each ────────────────────────────────────────────────────

    def detect_points(self, meta: dict, confidence_boost: float) -> list[DetectedItem]:
        """Detect point features using adaptive corner + blob detection.

        If blob filtering finds nothing, we fall back to strong corner
        points so a non‑empty dataset never results in 0 detections.
        """
        results: list[DetectedItem] = []

        corners = cv2.goodFeaturesToTrack(
            self.gray,
            maxCorners=600,
            qualityLevel=0.01,
            minDistance=8,
        )
        if corners is None:
            return results

        # Use adaptive threshold to find dark blobs (symbols on floor plans)
        thresh = cv2.adaptiveThreshold(
            self.gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            15,
            4,
        )
        # Find contours of symbols
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        avg_dataset_size = meta.get("avg_size", 0.02)
        # Slightly wider size band so we still try symbols that are a bit
        # smaller / larger than the strict dataset average.
        min_s = int(self.w * max(0.003, avg_dataset_size * 0.15))
        max_s = int(self.w * min(0.16, avg_dataset_size * 5.0))

        for cnt in cnts:
            x, y, cw, ch = cv2.boundingRect(cnt)
            if cw < min_s or ch < min_s or cw > max_s or ch > max_s:
                continue
            area = cv2.contourArea(cnt)
            if area < min_s * min_s * 0.15:
                continue

            cx = (x + cw / 2) / self.w
            cy = (y + ch / 2) / self.h
            compactness = area / (cw * ch) if cw * ch > 0 else 0
            conf = 0.4 + compactness * 0.3 + confidence_boost * 0.04
            results.append(
                DetectedItem(
                    geometry=[[round(cx, 5), round(cy, 5)]],
                    geometry_type="point",
                    count_type="each",
                    confidence=min(0.95, conf),
                    source_color=meta.get("color", ""),
                    source_shape=meta.get("shape", ""),
                )
            )

        primary = _nms_points(results, radius=0.02)
        if primary:
            return primary

        # Fallback: use a sparse set of strong corners as candidate points
        # so users see *some* detections even when the blob pass is empty.
        fallback: list[DetectedItem] = []
        max_pts = min(40, len(corners))
        for i in range(max_pts):
            x, y = corners[i, 0]
            cx = float(x) / self.w
            cy = float(y) / self.h
            conf = 0.25 + confidence_boost * 0.03
            fallback.append(
                DetectedItem(
                    geometry=[[round(cx, 5), round(cy, 5)]],
                    geometry_type="point",
                    count_type="each",
                    confidence=min(0.8, conf),
                    source_color=meta.get("color", ""),
                    source_shape=meta.get("shape", ""),
                )
            )

        return _nms_points(fallback, radius=0.03)

    # ── Lines / linear ───────────────────────────────────────────────────

    def detect_lines(self, meta: dict, confidence_boost: float) -> list[DetectedItem]:
        """Detect lines using Hough transform, filtered by dataset patterns.

        When dataset‑guided filters reject everything, we fall back to a
        looser geometric pass so linear trades still get visible results.
        """
        results: list[DetectedItem] = []
        dataset_angles = meta.get("angles", [])
        dataset_lengths = meta.get("lengths", [])

        min_len = max(12, int(self.w * 0.025))
        raw = cv2.HoughLinesP(
            self.edges,
            1,
            np.pi / 180,
            threshold=35,
            minLineLength=min_len,
            maxLineGap=10,
        )
        if raw is None:
            return results

        avg_len = sum(dataset_lengths) / len(dataset_lengths) if dataset_lengths else 0.15
        angle_tol = math.radians(22)

        for line in raw:
            x1, y1, x2, y2 = line[0]
            nx1, ny1 = x1 / self.w, y1 / self.h
            nx2, ny2 = x2 / self.w, y2 / self.h
            dx, dy = nx2 - nx1, ny2 - ny1
            length = math.hypot(dx, dy)
            angle = math.atan2(dy, dx)

            # Allow a broader length range so we still detect lines that
            # are somewhat shorter / longer than the dataset mean.
            if length < avg_len * 0.08 or length > avg_len * 7.0:
                continue

            if dataset_angles:
                match = any(
                    abs(angle - a) < angle_tol
                    or abs(angle - a + math.pi) < angle_tol
                    or abs(angle - a - math.pi) < angle_tol
                    for a in dataset_angles
                )
                if not match:
                    continue

            conf = 0.45 + confidence_boost * 0.04
            # Edge strength along the line
            pts_on = 5
            score = 0.0
            for i in range(pts_on):
                t = i / max(1, pts_on - 1)
                sx = max(0, min(self.w - 1, int(x1 + t * (x2 - x1))))
                sy = max(0, min(self.h - 1, int(y1 + t * (y2 - y1))))
                score += self.edges[sy, sx] / 255.0
            conf += (score / pts_on) * 0.3

            results.append(
                DetectedItem(
                    geometry=[[round(nx1, 5), round(ny1, 5)], [round(nx2, 5), round(ny2, 5)]],
                    geometry_type="polyline",
                    count_type="linear_feet",
                    confidence=min(0.95, conf),
                    length_ft=meta.get("avg_length_ft"),
                    source_color=meta.get("color", ""),
                )
            )

        primary = _nms_lines(results, radius=0.025)
        if primary:
            return primary

        # Fallback: keep a small set of raw Hough lines, ignoring strict
        # dataset filters, so the user still sees candidate linear paths.
        fallback: list[DetectedItem] = []
        max_lines = min(25, len(raw))
        for i in range(max_lines):
            x1, y1, x2, y2 = raw[i][0]
            nx1, ny1 = x1 / self.w, y1 / self.h
            nx2, ny2 = x2 / self.w, y2 / self.h
            dx, dy = nx2 - nx1, ny2 - ny1
            length = math.hypot(dx, dy)
            if length < 0.03:
                continue
            conf = 0.35 + confidence_boost * 0.03
            fallback.append(
                DetectedItem(
                    geometry=[[round(nx1, 5), round(ny1, 5)], [round(nx2, 5), round(ny2, 5)]],
                    geometry_type="polyline",
                    count_type="linear_feet",
                    confidence=min(0.85, conf),
                    length_ft=meta.get("avg_length_ft"),
                    source_color=meta.get("color", ""),
                )
            )

        return _nms_lines(fallback, radius=0.03)

    # ── Areas / polygons ─────────────────────────────────────────────────

    def detect_areas(self, meta: dict, confidence_boost: float) -> list[DetectedItem]:
        """Detect enclosed regions matching dataset area patterns.

        Adds a relaxed fallback so trades with a small dataset still
        produce candidate rooms/spaces instead of returning zero.
        """
        results: list[DetectedItem] = []
        dataset_areas = meta.get("areas", [])
        dataset_ratios = meta.get("aspect_ratios", [])

        kernel = np.ones((3, 3), np.uint8)
        closed = cv2.dilate(self.edges, kernel, iterations=2)
        closed = cv2.morphologyEx(closed, cv2.MORPH_CLOSE, kernel, iterations=2)
        cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not cnts:
            return results

        avg_area = sum(dataset_areas) / len(dataset_areas) if dataset_areas else 0.02

        for cnt in cnts:
            if len(cnt) < 4:
                continue
            eps = 0.015 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, eps, True)
            if len(approx) < 3:
                continue

            pts = [[float(p[0][0]) / self.w, float(p[0][1]) / self.h] for p in approx]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            wn, hn = max(xs) - min(xs), max(ys) - min(ys)
            area_n = wn * hn
            # Slightly wider tolerance on area so rooms/spaces that are
            # modestly larger or smaller than the dataset average are
            # still considered.
            if area_n < avg_area * 0.08 or area_n > avg_area * 9.0:
                continue
            if wn < 0.012 or hn < 0.012:
                continue

            conf = 0.35 + confidence_boost * 0.04
            if dataset_ratios and hn > 0:
                ar = wn / hn
                best_diff = min(abs(ar - r) for r in dataset_ratios)
                if best_diff < 0.45:
                    conf += 0.2
            if dataset_areas:
                best_area_diff = min(abs(area_n - a) for a in dataset_areas)
                if best_area_diff < avg_area * 0.6:
                    conf += 0.15

            closed_pts = [[round(p[0], 5), round(p[1], 5)] for p in pts]
            if closed_pts[0] != closed_pts[-1]:
                closed_pts.append(closed_pts[0])

            results.append(
                DetectedItem(
                    geometry=closed_pts,
                    geometry_type="polygon",
                    count_type="area_perimeter",
                    confidence=min(0.95, conf),
                    area_sqft=meta.get("avg_area_sqft"),
                    perimeter_ft=meta.get("avg_perimeter_ft"),
                    source_color=meta.get("color", ""),
                )
            )

        primary = _nms_areas(results, iou_thresh=0.3)
        if primary:
            return primary

        # Fallback: choose a handful of the largest closed contours as
        # generic rooms when dataset‑guided filters reject everything.
        areas_with_idx = []
        for idx, cnt in enumerate(cnts):
            if len(cnt) < 4:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            if w < 10 or h < 10:
                continue
            areas_with_idx.append((w * h, idx))

        areas_with_idx.sort(reverse=True)
        fallback: list[DetectedItem] = []
        for _, idx in areas_with_idx[:20]:
            cnt = cnts[idx]
            eps = 0.02 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, eps, True)
            if len(approx) < 3:
                continue
            pts = [[float(p[0][0]) / self.w, float(p[0][1]) / self.h] for p in approx]
            closed_pts = [[round(p[0], 5), round(p[1], 5)] for p in pts]
            if closed_pts[0] != closed_pts[-1]:
                closed_pts.append(closed_pts[0])

            conf = 0.3 + confidence_boost * 0.03
            fallback.append(
                DetectedItem(
                    geometry=closed_pts,
                    geometry_type="polygon",
                    count_type="area_perimeter",
                    confidence=min(0.85, conf),
                    area_sqft=meta.get("avg_area_sqft"),
                    perimeter_ft=meta.get("avg_perimeter_ft"),
                    source_color=meta.get("color", ""),
                )
            )

        return _nms_areas(fallback, iou_thresh=0.35)


# ─────────────────────────────────────────────────────────────────────────────
#  Main entry point
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DefProfile:
    """Aggregated metadata for one distinct CountDefinition in the dataset."""
    def_id: int
    name: str
    count_type: str
    color: str
    shape: str
    sizes: list = None
    angles: list = None
    lengths: list = None
    areas: list = None
    aspect_ratios: list = None
    area_sqfts: list = None
    perimeter_fts: list = None
    length_fts: list = None
    # For "each" symbols with drawn shapes (rect/circle/triangle),
    # we keep track of typical box dimensions and rotations so the
    # frontend can recreate realistic shapes around detected centers.
    box_widths: list = None
    box_heights: list = None
    rotations_deg: list = None
    item_count: int = 0

    def __post_init__(self):
        for f in ("sizes", "angles", "lengths", "areas", "aspect_ratios",
                   "area_sqfts", "perimeter_fts", "length_fts",
                   "box_widths", "box_heights", "rotations_deg"):
            if getattr(self, f) is None:
                setattr(self, f, [])


def run_ml_detection(
    target_page,
    trade: str,
    global_items: list,
    max_results: int = 30,
) -> tuple[list[DetectedItem], list[DefProfile]]:
    """
    Fast ML detection — analyses ONLY the target image (no source loading).
    Uses dataset metadata (sizes, angles, types) to guide detection.

    Key: runs detection for EVERY distinct CountDefinition in the dataset
    separately, so that if one trade has "Area", "Linear", AND "Count" items,
    all three appear in the results with their correct colors.
    """
    target_path = _resolve_image_path(target_page.image)
    if not target_path:
        return [], []

    try:
        detector = FastDetector(target_path)
    except Exception as exc:
        logger.error("Detector init failed page=%s: %s", target_page.id, exc)
        return [], []

    # ── Build per-definition profiles from the global dataset ──
    profiles: dict[int, DefProfile] = {}

    for item in global_items:
        cdef = item.count_definition
        g = item.geometry
        did = cdef.id

        if did not in profiles:
            profiles[did] = DefProfile(
                def_id=did,
                name=cdef.name,
                count_type=cdef.count_type,
                color=cdef.color,
                shape=cdef.shape or "",
            )
        p = profiles[did]
        p.item_count += 1

        if p.count_type == "each" and g:
            xs = [pt[0] for pt in g]; ys = [pt[1] for pt in g]
            w = max(xs) - min(xs)
            h = max(ys) - min(ys)
            p.sizes.append(max(w, h, 0.005))
            # Capture typical box dimensions and rotation for drawn
            # symbols so detections can recreate realistic shapes.
            p.box_widths.append(max(w, 0.005))
            p.box_heights.append(max(h, 0.005))
            if getattr(item, "rotation_deg", None) is not None:
                p.rotations_deg.append(float(item.rotation_deg or 0.0))

        elif p.count_type == "linear_feet" and len(g) >= 2:
            dx = g[-1][0] - g[0][0]
            dy = g[-1][1] - g[0][1]
            p.angles.append(math.atan2(dy, dx))
            p.lengths.append(math.hypot(dx, dy))
            if item.length_ft:
                p.length_fts.append(item.length_ft)

        elif p.count_type == "area_perimeter" and len(g) >= 3:
            xs = [pt[0] for pt in g]; ys = [pt[1] for pt in g]
            wn, hn = max(xs) - min(xs), max(ys) - min(ys)
            p.areas.append(wn * hn)
            if hn > 0:
                p.aspect_ratios.append(wn / hn)
            if item.area_sqft:
                p.area_sqfts.append(item.area_sqft)
            if item.perimeter_ft:
                p.perimeter_fts.append(item.perimeter_ft)

    if not profiles:
        return [], []

    total = len(global_items)

    # ── Run detection per profile with *no* preference by frequency ──
    # Each distinct CountDefinition (count type + color/shape) should be
    # treated independently. We give every profile an equal cap so that
    # having more examples for one type never suppresses other types.
    profile_list = list(profiles.values())
    n_profiles = len(profile_list)

    # Cap detections per profile so output density matches typical
    # human-annotated pages. More dataset later will improve *which*
    # detections we keep (higher confidence), not how many we place.
    max_per_profile = 18
    if max_results and n_profiles > 0:
        base_cap = max(3, min(max_per_profile, max_results // n_profiles))
        extra = max(0, max_results - base_cap * n_profiles)
    else:
        base_cap = min(10, max_per_profile)
        extra = 0

    budget: dict[int, int] = {}
    for idx, p in enumerate(profile_list):
        cap = min(max_per_profile, base_cap)
        if extra > 0:
            cap = min(max_per_profile, cap + 1)
            extra -= 1
        budget[p.def_id] = cap

    # Drop very low-confidence detections so we don't clutter the plan
    # with fallback guesses. As the dataset grows, more real matches
    # will pass this threshold.
    min_confidence = 0.38

    all_dets: list[DetectedItem] = []

    for p in profile_list:
        cap = budget.get(p.def_id, 3)
        # Per-definition confidence scaling: keep this effectively
        # flat so that rarer and more common count types are treated
        # equally when we place detections. Every profile that has
        # dataset examples gets the same boost.
        local_boost = 2.0 if p.item_count > 0 else 1.0

        if p.count_type == "each":
            avg_size = (
                sum(p.sizes) / len(p.sizes)
                if p.sizes else 0.02  # sensible default symbol size
            )
            meta = {
                "avg_size": avg_size,
                "color": p.color,
                "shape": p.shape,
            }
            dets = detector.detect_points(meta, local_boost)
            for d in dets[:cap]:
                if d.confidence < min_confidence:
                    continue
                d.source_color = p.color
                d.source_shape = p.shape
                d.source_def_id = p.def_id
                d.source_def_name = p.name
                d.count_type = "each"
                all_dets.append(d)

        elif p.count_type == "linear_feet":
            meta = {
                "angles": p.angles,
                "lengths": p.lengths,
                "color": p.color,
                "avg_length_ft": (
                    sum(p.length_fts) / len(p.length_fts)
                    if p.length_fts else None
                ),
            }
            dets = detector.detect_lines(meta, local_boost)
            for d in dets[:cap]:
                if d.confidence < min_confidence:
                    continue
                d.source_color = p.color
                d.source_def_id = p.def_id
                d.source_def_name = p.name
                d.count_type = "linear_feet"
                all_dets.append(d)

        elif p.count_type == "area_perimeter":
            meta = {
                "areas": p.areas,
                "aspect_ratios": p.aspect_ratios,
                "color": p.color,
                "avg_area_sqft": (
                    sum(p.area_sqfts) / len(p.area_sqfts)
                    if p.area_sqfts else None
                ),
                "avg_perimeter_ft": (
                    sum(p.perimeter_fts) / len(p.perimeter_fts)
                    if p.perimeter_fts else None
                ),
            }
            dets = detector.detect_areas(meta, local_boost)
            for d in dets[:cap]:
                if d.confidence < min_confidence:
                    continue
                d.source_color = p.color
                d.source_def_id = p.def_id
                d.source_def_name = p.name
                d.count_type = "area_perimeter"
                all_dets.append(d)

    all_dets.sort(key=lambda d: d.confidence, reverse=True)

    logger.info(
        "ML detect: trade=%s, dataset=%d items across %d definitions, "
        "detections=%d, img=%dx%d→%dx%d",
        trade, total, len(profiles), len(all_dets),
        detector.orig_w, detector.orig_h, detector.w, detector.h,
    )

    # Return both detections and the per-definition profiles so the
    # caller can use detailed dataset metadata (including box sizes
    # and rotations for symbol shapes) when creating CountDefinitions
    # and shaping geometry around detected centers.
    return all_dets, list(profiles.values())
