from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from rest_framework.routers import DefaultRouter

from core.views import (
    ProjectViewSet,
    PlanSetViewSet,
    PlanPageViewSet,
    CountDefinitionViewSet,
    CountItemViewSet,
    ScaleCalibrationViewSet,
    DatasetExampleViewSet,
    DetectionViewSet,
    TradeDatasetViewSet,
    DatasetImageViewSet,
    contact_create,
    contact_list,
    health_check,
    subscription_detail,
    subscription_create_or_update,
    subscription_skip,
    subscription_cancel,
    team_list,
    team_add_member,
    team_update_member,
    team_remove_member,
    privacy_agree,
    privacy_status,
    user_search,
    dataset_stats_all,
)
from core.auth_views import register, login, logout, me, change_password

router = DefaultRouter()
router.register(r"projects", ProjectViewSet)
router.register(r"plan-sets", PlanSetViewSet)
router.register(r"pages", PlanPageViewSet)
router.register(r"count-definitions", CountDefinitionViewSet)
router.register(r"count-items", CountItemViewSet)
router.register(r"scales", ScaleCalibrationViewSet)
router.register(r"dataset-examples", DatasetExampleViewSet)
router.register(r"detections", DetectionViewSet)
router.register(r"trade-datasets", TradeDatasetViewSet)
router.register(r"dataset-images", DatasetImageViewSet)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health_check"),
    # Auth
    path("api/auth/register/", register, name="register"),
    path("api/auth/login/", login, name="login"),
    path("api/auth/logout/", logout, name="logout"),
    path("api/auth/me/", me, name="me"),
    path("api/auth/change-password/", change_password, name="change_password"),
    # Contact
    path("api/contact/", contact_create, name="contact_create"),
    path("api/contact/mine/", contact_list, name="contact_list"),
    # Subscription
    path("api/subscription/", subscription_detail, name="subscription_detail"),
    path("api/subscription/create/", subscription_create_or_update, name="subscription_create"),
    path("api/subscription/skip/", subscription_skip, name="subscription_skip"),
    path("api/subscription/cancel/", subscription_cancel, name="subscription_cancel"),
    # Team
    path("api/team/", team_list, name="team_list"),
    path("api/team/add/", team_add_member, name="team_add"),
    path("api/team/<int:member_id>/update/", team_update_member, name="team_update"),
    path("api/team/<int:member_id>/remove/", team_remove_member, name="team_remove"),
    # Privacy
    path("api/privacy/agree/", privacy_agree, name="privacy_agree"),
    path("api/privacy/status/", privacy_status, name="privacy_status"),
    # User search
    path("api/users/search/", user_search, name="user_search"),
    # Dataset stats
    path("api/dataset-stats/", dataset_stats_all, name="dataset_stats"),
    # Router
    path("api/", include(router.urls)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
