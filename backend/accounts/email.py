"""djoser email classes that send Brevo-hosted templates instead of rendering HTML.

The auth emails live in Brevo (designed in the dashboard, one template per language).
Each class here picks the Brevo template id for the request's active language — set by
`LocaleMiddleware` from the SPA's `Accept-Language` header — and hands Brevo the merge
params. Anymail's Brevo backend reads ``template_id`` + ``merge_global_data`` off the
message, so we override djoser's ``render`` (the "produce the body" step) to set those
instead of building an HTML body; djoser's ``send`` still handles recipients/from-email.

Wired in via ``DJOSER["EMAIL"]`` (see config/settings.py). Because every auth email is
triggered inside the request that carries ``Accept-Language``, ``get_language()`` is a
reliable language signal and no per-user language needs to be stored.
"""

from django.conf import settings
from django.utils.translation import get_language
from djoser import email as djoser_email

# The active language comes from get_language(), set by LocaleMiddleware from the
# request's Accept-Language (the SPA always sends an explicit fr/en). FALLBACK_LANGUAGE
# only guards the degenerate case where get_language() yields nothing; note that an
# unsupported/missing header resolves to LANGUAGE_CODE ("en") upstream, not to French.
FALLBACK_LANGUAGE = "fr"
SUPPORTED_LANGUAGES = ("fr", "en")


def _language() -> str:
    lang = (get_language() or FALLBACK_LANGUAGE).split("-")[0].lower()
    return lang if lang in SUPPORTED_LANGUAGES else FALLBACK_LANGUAGE


class _BrevoTemplateEmail(djoser_email.BaseDjoserEmail):
    """Send a language-specific Brevo template rather than a rendered body.

    Subclasses set ``template_key`` (a key into ``settings.BREVO_TEMPLATE_IDS``) and, when
    the template needs a link, override ``get_merge_data``. Mixed ahead of a concrete djoser
    email class, so that class's ``get_context_data`` (uid/token/url/site_name…) still wins;
    inheriting ``BaseDjoserEmail`` here just gives ``render`` a real message to configure.
    """

    template_key = ""

    def get_merge_data(self, context):
        # Default params for templates that only greet — subclasses add urls as needed.
        return self._base_params(context)

    def _base_params(self, context):
        user = context.get("user")
        return {
            "first_name": (getattr(user, "first_name", "") or "").strip(),
            "site_name": context.get("site_name", ""),
        }

    def _frontend_url(self, context, path):
        return f"{context['protocol']}://{context['domain']}/{path}"

    def render(self):
        # djoser's send() calls render() to build the body, then handles to/from_email and
        # nulls the request. We render no body (it lives in the Brevo template), so we only
        # pick the template id for the active language and attach the merge params.
        context = self.get_context_data()
        self.template_id = settings.BREVO_TEMPLATE_IDS[self.template_key][_language()]
        self.merge_global_data = self.get_merge_data(context)


class ActivationEmail(_BrevoTemplateEmail, djoser_email.ActivationEmail):
    template_key = "activation"

    def get_merge_data(self, context):
        params = self._base_params(context)
        params["activation_url"] = self._frontend_url(context, context["url"])
        return params


class ConfirmationEmail(_BrevoTemplateEmail, djoser_email.ConfirmationEmail):
    template_key = "confirmation"

    def get_merge_data(self, context):
        params = self._base_params(context)
        params["login_url"] = self._frontend_url(context, "login")
        return params


class PasswordResetEmail(_BrevoTemplateEmail, djoser_email.PasswordResetEmail):
    template_key = "password_reset"

    def get_merge_data(self, context):
        params = self._base_params(context)
        params["reset_url"] = self._frontend_url(context, context["url"])
        return params


class PasswordChangedConfirmationEmail(
    _BrevoTemplateEmail, djoser_email.PasswordChangedConfirmationEmail
):
    template_key = "password_changed_confirmation"


class UsernameChangedConfirmationEmail(
    _BrevoTemplateEmail, djoser_email.UsernameChangedConfirmationEmail
):
    # Login is by email, so djoser's "username changed" confirmation is our
    # "email changed" confirmation.
    template_key = "email_changed_confirmation"
