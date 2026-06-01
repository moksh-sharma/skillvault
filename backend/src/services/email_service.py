"""Email sending service for admin invite (Microsoft Graph / Outlook only)."""
from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)


def _is_graph_send_configured() -> bool:
    return bool(
        getattr(settings, "azure_tenant_id", None)
        and getattr(settings, "azure_client_id", None)
        and getattr(settings, "azure_client_secret", None)
        and getattr(settings, "mailbox_email", None)
        and str(getattr(settings, "mailbox_email", "") or "").strip()
    )


def is_email_configured() -> bool:
    """Return True if Microsoft Graph (Outlook) is configured for sending."""
    return _is_graph_send_configured()


def send_admin_invite_email(
    to_email: str,
    login_id: str,
    temporary_password: str,
    set_password_link: str,
) -> None:
    """
    Send admin invite email with login ID, temporary password, and set-password link.
    Uses Microsoft Graph (Outlook) only. Requires AZURE_* and MAILBOX_EMAIL to be set.
    Raises RuntimeError if Outlook is not configured or send fails.
    """
    if not is_email_configured():
        logger.error("Outlook not configured: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MAILBOX_EMAIL.")
        raise RuntimeError(
            "Email is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and MAILBOX_EMAIL to send invites."
        )

    subject = "Welcome to SkillVault - Set Your Password"
    body_plain = f"""Hello,

You have been invited to access the SkillVault Admin Portal.

Your login credentials:
- Portal link: {set_password_link}
- Email: {login_id}
- Temporary password: {temporary_password}

Set your password using the link above (expires in 7 days), then log in with your email and new password.

If you did not expect this email, please ignore it.
"""
    # Recipient first name for greeting (use part before @ or "there")
    greeting_name = (login_id or "").split("@")[0].strip() or "there"
    if greeting_name and not greeting_name[0].isalpha():
        greeting_name = "there"
    greeting_name = greeting_name.capitalize() if greeting_name != "there" else greeting_name

    body_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SkillVault</title>
</head>
<body style="margin:0; padding:0; background-color:#1a1a1a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1a1a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color:#2a2a2a; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
          <tr>
            <td style="padding: 40px 36px; text-align: center;">
              <div style="margin-bottom: 8px;">
                <span style="font-size: 28px; font-weight: 700; color: #e0e0e0;">Tech</span><span style="font-size: 28px; font-weight: 700; color: #7fb7b0;">BankAI</span>
              </div>
              <h1 style="margin: 24px 0 12px 0; font-size: 26px; font-weight: 700; color: #ffffff;">Welcome to SkillVault!</h1>
              <p style="margin: 0 0 28px 0; font-size: 15px; font-weight: 600; color: #9ccc65;">Your account has been created. Set your password to get started.</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #e0e0e0;">Hi {greeting_name},</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #e0e0e0;">You have been invited to access the <strong style="color: #fff;">SkillVault Admin Portal</strong>. Use the details below to set your password, then log in.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background-color:#3d4042; border-radius: 10px; padding: 20px 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #b0b0b0;">Portal link</p>
                    <p style="margin: 0 0 18px 0; font-size: 14px;"><a href="{set_password_link}" style="color: #7fb7b0; text-decoration: underline; word-break: break-all;">{set_password_link}</a></p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #b0b0b0;">Email</p>
                    <p style="margin: 0 0 18px 0; font-size: 14px; color: #ffffff;">{login_id}</p>
                    <p style="margin: 0 0 0 0; font-size: 14px; color: #b0b0b0;">Temporary password</p>
                    <p style="margin: 0; font-size: 14px; color: #ffffff;">{temporary_password}</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 28px 0; font-size: 14px; color: #b0b0b0;">This link expires in 7 days. We recommend changing your password after first login for security.</p>
              <a href="{set_password_link}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #7fb7b0 0%, #5a9a94 100%); color: #ffffff !important; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 14px rgba(127, 183, 176, 0.4);">Set your password</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 36px; background-color:#222; border-top: 1px solid #333; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #888;">If you did not expect this email, you can safely ignore it.</p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #666;">© 2026 SkillVault. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    from src.services.outlook_service import send_mail_via_graph
    send_mail_via_graph(to_email=to_email, subject=subject, body_html=body_html, body_plain=body_plain)
    logger.info(f"Invite email sent to {to_email} via Outlook (Graph)")
