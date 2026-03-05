from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone


User = get_user_model()


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Project(TimeStampedModel):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="projects",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    client_name = models.CharField(max_length=255, blank=True)
    estimating_email = models.EmailField(blank=True)
    is_starred = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.name


class EmailCategory(models.TextChoices):
    INVITE = "invite", "Bid Invitation"
    CHANGE = "change", "Change / Addendum"
    GENERAL = "general", "General"


class ProjectEmail(TimeStampedModel):
    """
    Email message linked to a project, categorised by ML as an invite,
    change order, or general correspondence.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="emails")
    subject = models.CharField(max_length=500, blank=True)
    sender = models.EmailField(blank=True)
    body_preview = models.TextField(blank=True)
    category = models.CharField(
        max_length=16,
        choices=EmailCategory.choices,
        default=EmailCategory.GENERAL,
    )
    received_at = models.DateTimeField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    raw_headers = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-received_at"]

    def __str__(self) -> str:
        return f"[{self.get_category_display()}] {self.subject[:60]}"


class Trade(models.TextChoices):
    ACOUSTIC = "acoustic", "Acoustic"
    ELECTRICAL = "electrical", "Electrical"
    PLUMBING = "plumbing", "Plumbing"
    MECHANICAL = "mechanical", "Mechanical"
    OTHER = "other", "Other"


class PlanSet(TimeStampedModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="plan_sets")
    name = models.CharField(max_length=255)
    pdf_file = models.FileField(upload_to="plans/pdfs/")
    # Progress while converting PDF to page images (null when not processing).
    processing_pages_total = models.PositiveIntegerField(null=True, blank=True)
    processing_pages_done = models.PositiveIntegerField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.project.name} - {self.name}"


class PlanPage(TimeStampedModel):
    plan_set = models.ForeignKey(PlanSet, on_delete=models.CASCADE, related_name="pages")
    page_number = models.PositiveIntegerField()
    title = models.CharField(max_length=255, blank=True)
    image = models.ImageField(upload_to="plans/pages/")
    # Stored rendering resolution (dots per inch) for this page image.
    # We render PDF pages using PyMuPDF at a fixed zoom, so knowing the
    # effective DPI lets the frontend derive a pixel-to-feet scale directly
    # from architectural plan scales (e.g. 1/8\" = 1'-0\") without having
    # to draw a calibration line.
    dpi_x = models.FloatField(null=True, blank=True)
    dpi_y = models.FloatField(null=True, blank=True)

    class Meta:
        unique_together = ("plan_set", "page_number")
        ordering = ["page_number"]

    def __str__(self) -> str:
        return f"{self.plan_set} - Page {self.page_number}"


class CountType(models.TextChoices):
    AREA_PERIMETER = "area_perimeter", "Area & Perimeter"
    LINEAR_FEET = "linear_feet", "Linear Feet"
    EACH = "each", "Each"


class CountDefinition(TimeStampedModel):
    plan_set = models.ForeignKey(PlanSet, on_delete=models.CASCADE, related_name="count_definitions")
    name = models.CharField(max_length=255)
    count_type = models.CharField(max_length=32, choices=CountType.choices)
    color = models.CharField(max_length=32, default="#00ff00")
    shape = models.CharField(max_length=16, blank=True)  # for EACH: square/circle/triangle
    trade = models.CharField(max_length=32, choices=Trade.choices, default=Trade.OTHER)

    def __str__(self) -> str:
        return f"{self.name} ({self.get_count_type_display()})"


class CountItem(TimeStampedModel):
    count_definition = models.ForeignKey(
        CountDefinition, on_delete=models.CASCADE, related_name="items"
    )
    page = models.ForeignKey(PlanPage, on_delete=models.CASCADE, related_name="count_items")
    geometry_type = models.CharField(max_length=32)  # 'point', 'polyline', 'polygon'
    geometry = models.JSONField()  # vertices / positions in normalized [0,1] coords
    area_sqft = models.FloatField(null=True, blank=True)
    perimeter_ft = models.FloatField(null=True, blank=True)
    length_ft = models.FloatField(null=True, blank=True)
    rotation_deg = models.FloatField(null=True, blank=True, default=0)
    is_auto_detected = models.BooleanField(default=False)


class ScaleCalibration(TimeStampedModel):
    page = models.OneToOneField(PlanPage, on_delete=models.CASCADE, related_name="scale")
    real_world_feet = models.FloatField()
    pixel_distance = models.FloatField()


class DatasetExample(TimeStampedModel):
    """
    Single labeled example for ML training.
    """

    plan_page = models.ForeignKey(PlanPage, on_delete=models.CASCADE, related_name="dataset_examples")
    trade = models.CharField(max_length=32, choices=Trade.choices)
    count_definition = models.ForeignKey(
        CountDefinition, on_delete=models.SET_NULL, null=True, blank=True
    )
    image = models.ImageField(upload_to="datasets/examples/")
    metadata = models.JSONField(default=dict, blank=True)


class Detection(TimeStampedModel):
    """
    ML detection prediction on a page; can be confirmed/edited.
    """

    plan_page = models.ForeignKey(PlanPage, on_delete=models.CASCADE, related_name="detections")
    trade = models.CharField(max_length=32, choices=Trade.choices)
    count_definition = models.ForeignKey(
        CountDefinition, on_delete=models.SET_NULL, null=True, blank=True
    )
    geometry = models.JSONField()
    score = models.FloatField(default=0.0)
    is_confirmed = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)


class ContactMessage(TimeStampedModel):
    """Contact form submission; admin can add reply in admin panel."""
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="contact_messages",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    email = models.EmailField()
    message = models.TextField()
    reply = models.TextField(blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.reply and not self.replied_at:
            self.replied_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} ({self.email})"


# ──────────────────────────────────────────────────────────────
#  Subscription & Team Management
# ──────────────────────────────────────────────────────────────

class SubscriptionPlan(models.TextChoices):
    FREE = "free", "Free"
    PRO = "pro", "Pro ($49/mo)"
    BUSINESS = "business", "Business ($149/mo)"


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    CANCELLED = "cancelled", "Cancelled"
    PAST_DUE = "past_due", "Past Due"
    TRIALING = "trialing", "Trialing"


class Subscription(TimeStampedModel):
    owner = models.OneToOneField(User, on_delete=models.CASCADE, related_name="subscription")
    plan = models.CharField(max_length=32, choices=SubscriptionPlan.choices, default=SubscriptionPlan.FREE)
    status = models.CharField(max_length=32, choices=SubscriptionStatus.choices, default=SubscriptionStatus.ACTIVE)
    max_team_members = models.PositiveIntegerField(default=3)
    stripe_customer_id = models.CharField(max_length=255, blank=True)
    stripe_subscription_id = models.CharField(max_length=255, blank=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.owner.username} - {self.get_plan_display()}"

    def save(self, *args, **kwargs):
        # Set max_team_members based on plan
        if self.plan == SubscriptionPlan.BUSINESS:
            self.max_team_members = 50
        elif self.plan == SubscriptionPlan.PRO:
            self.max_team_members = 3
        else:  # FREE
            self.max_team_members = 3
        super().save(*args, **kwargs)

    @property
    def is_active(self):
        return self.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING)


class TeamRole(models.TextChoices):
    VIEWER = "viewer", "View Only"
    EDITOR = "editor", "Can Edit"


class TeamMember(TimeStampedModel):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="team_members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="team_memberships")
    role = models.CharField(max_length=16, choices=TeamRole.choices, default=TeamRole.VIEWER)
    invited_email = models.EmailField(blank=True)
    accepted = models.BooleanField(default=False)

    class Meta:
        unique_together = ("subscription", "user")

    def __str__(self) -> str:
        return f"{self.user.username} ({self.get_role_display()}) on {self.subscription}"


class PrivacyAgreement(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="privacy_agreement")
    agreed = models.BooleanField(default=False)
    agreed_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.user.username} - {'Agreed' if self.agreed else 'Not agreed'}"


# ──────────────────────────────────────────────────────────────
#  ML Trade Datasets
# ──────────────────────────────────────────────────────────────

class TradeDataset(TimeStampedModel):
    """
    Per-trade dataset container. Each trade has a separate dataset
    so models can be trained independently for better accuracy.
    """
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="trade_datasets")
    trade = models.CharField(max_length=32, choices=Trade.choices)
    name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("owner", "trade")

    def __str__(self) -> str:
        return f"{self.owner.username} - {self.get_trade_display()} Dataset"

    @property
    def example_count(self):
        return self.images.count() + DatasetExample.objects.filter(
            trade=self.trade,
            plan_page__plan_set__project__owner=self.owner,
        ).count()


class DatasetImage(TimeStampedModel):
    """
    Standalone image uploaded directly to a trade's dataset
    (not from a plan page).
    """
    dataset = models.ForeignKey(TradeDataset, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="datasets/uploads/")
    label = models.CharField(max_length=255, blank=True)
    annotations = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return f"Dataset image {self.id} - {self.label or 'unlabeled'}"

