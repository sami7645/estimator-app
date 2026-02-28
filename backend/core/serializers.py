from rest_framework import serializers
from django.contrib.auth import get_user_model

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

User = get_user_model()


class ProjectSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        """
        Prevent creating multiple projects with the same name for a single owner.
        Legacy projects (with no owner) are still allowed but must also be unique by name.
        """
        request = self.context.get("request")
        name = attrs.get("name") or (self.instance.name if self.instance else None)
        if not name:
            return attrs

        owner = None
        if request and request.user and request.user.is_authenticated:
            owner = request.user

        qs = Project.objects.all()
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.filter(name=name, owner=owner).exists():
            raise serializers.ValidationError({"name": "You already have a project with this name."})

        return attrs

    class Meta:
        model = Project
        fields = "__all__"
        read_only_fields = ("id", "owner", "created_at", "updated_at")


class PlanPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanPage
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class PlanSetSerializer(serializers.ModelSerializer):
    pages = PlanPageSerializer(many=True, read_only=True)

    class Meta:
        model = PlanSet
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class CountDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CountDefinition
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class CountItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CountItem
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class ScaleCalibrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScaleCalibration
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class DatasetExampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatasetExample
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class DetectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Detection
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ("id", "name", "email", "message", "reply", "replied_at", "created_at")
        read_only_fields = ("id", "reply", "replied_at", "created_at")


class TeamMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = TeamMember
        fields = ("id", "user_id", "username", "email", "role", "invited_email", "accepted", "created_at")
        read_only_fields = ("id", "created_at", "accepted")


class SubscriptionSerializer(serializers.ModelSerializer):
    team_members = TeamMemberSerializer(many=True, read_only=True)
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    owner_email = serializers.CharField(source="owner.email", read_only=True)

    class Meta:
        model = Subscription
        fields = (
            "id", "owner", "owner_username", "owner_email", "plan", "status",
            "max_team_members", "stripe_customer_id", "stripe_subscription_id",
            "current_period_start", "current_period_end",
            "team_members", "created_at", "updated_at",
        )
        read_only_fields = ("id", "owner", "created_at", "updated_at")


class PrivacyAgreementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrivacyAgreement
        fields = ("id", "user", "agreed", "agreed_at", "ip_address", "created_at")
        read_only_fields = ("id", "user", "agreed_at", "created_at")


class DatasetImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatasetImage
        fields = "__all__"
        read_only_fields = ("id", "created_at", "updated_at")


class TradeDatasetSerializer(serializers.ModelSerializer):
    images = DatasetImageSerializer(many=True, read_only=True)
    example_count = serializers.SerializerMethodField()
    page_example_count = serializers.SerializerMethodField()

    class Meta:
        model = TradeDataset
        fields = (
            "id", "owner", "trade", "name", "description", "is_active",
            "images", "example_count", "page_example_count", "created_at", "updated_at",
        )
        read_only_fields = ("id", "owner", "created_at", "updated_at")

    def get_example_count(self, obj):
        return obj.images.count()

    def get_page_example_count(self, obj):
        return DatasetExample.objects.filter(
            trade=obj.trade,
            plan_page__plan_set__project__owner=obj.owner,
        ).count()


class UserSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")

