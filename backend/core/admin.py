from django.contrib import admin

from .models import (
    Project,
    PlanSet,
    PlanPage,
    CountDefinition,
    CountItem,
    ScaleCalibration,
    DatasetExample,
    Detection,
    ContactMessage,
    Subscription,
    TeamMember,
    PrivacyAgreement,
    TradeDataset,
    DatasetImage,
)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "client_name", "owner", "created_at")
    search_fields = ("name", "client_name", "owner__username")


@admin.register(PlanSet)
class PlanSetAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "project", "created_at")
    search_fields = ("name", "project__name")


@admin.register(PlanPage)
class PlanPageAdmin(admin.ModelAdmin):
    list_display = ("id", "plan_set", "page_number", "title")
    list_filter = ("plan_set",)


@admin.register(CountDefinition)
class CountDefinitionAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "plan_set", "count_type", "trade")
    list_filter = ("plan_set", "count_type", "trade")


@admin.register(CountItem)
class CountItemAdmin(admin.ModelAdmin):
    list_display = ("id", "count_definition", "page", "geometry_type")
    list_filter = ("geometry_type", "count_definition__plan_set")


@admin.register(ScaleCalibration)
class ScaleCalibrationAdmin(admin.ModelAdmin):
    list_display = ("id", "page", "real_world_feet", "pixel_distance")


@admin.register(DatasetExample)
class DatasetExampleAdmin(admin.ModelAdmin):
    list_display = ("id", "plan_page", "trade", "count_definition")
    list_filter = ("trade",)


@admin.register(Detection)
class DetectionAdmin(admin.ModelAdmin):
    list_display = ("id", "plan_page", "trade", "score", "is_confirmed", "is_deleted")
    list_filter = ("trade", "is_confirmed", "is_deleted")


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "email", "user", "created_at", "replied_at")
    list_filter = ("replied_at",)
    search_fields = ("name", "email", "message")
    readonly_fields = ("created_at", "updated_at")
    fields = ("user", "name", "email", "message", "reply", "replied_at", "created_at", "updated_at")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "plan", "status", "max_team_members", "created_at")
    list_filter = ("plan", "status")
    search_fields = ("owner__username", "owner__email")


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 0


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ("id", "subscription", "user", "role", "accepted", "created_at")
    list_filter = ("role", "accepted")
    search_fields = ("user__username", "user__email")


@admin.register(PrivacyAgreement)
class PrivacyAgreementAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "agreed", "agreed_at")
    list_filter = ("agreed",)
    search_fields = ("user__username",)


@admin.register(TradeDataset)
class TradeDatasetAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "trade", "name", "is_active", "created_at")
    list_filter = ("trade", "is_active")
    search_fields = ("owner__username", "name")


@admin.register(DatasetImage)
class DatasetImageAdmin(admin.ModelAdmin):
    list_display = ("id", "dataset", "label", "created_at")
    search_fields = ("label",)

