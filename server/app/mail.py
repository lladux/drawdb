import base64
import binascii
import logging
import re
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from .config import Settings

logger = logging.getLogger(__name__)

DATA_URI = re.compile(
    r"^data:(?P<mime>[\w.+-]+/[\w.+-]+)?(?:;[^,]*)?;base64,(?P<data>.*)$", re.DOTALL
)


@dataclass
class Attachment:
    filename: str
    mime: str
    data: bytes


def parse_data_uri(uri: str, filename: str) -> Attachment:
    """Decode a base64 data URI. Anything else is rejected, so clients cannot
    make the server attach files from its own disk or from URLs."""
    match = DATA_URI.match(uri)
    if not match:
        raise ValueError("Attachments must be base64 data URIs")
    try:
        data = base64.b64decode(match["data"], validate=True)
    except binascii.Error as e:
        raise ValueError("Invalid base64 in attachment") from e
    return Attachment(filename, match["mime"] or "application/octet-stream", data)


def send_email(settings: Settings, subject: str, html: str, attachments: list[Attachment]) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.mail_username
    msg["To"] = settings.mail_username
    msg.set_content(html, subtype="html")
    for a in attachments:
        maintype, subtype = a.mime.split("/", 1)
        msg.add_attachment(a.data, maintype=maintype, subtype=subtype, filename=a.filename)

    context = ssl.create_default_context()
    if settings.mail_port == 465:
        smtp = smtplib.SMTP_SSL(settings.mail_host, settings.mail_port, context=context)
    else:
        smtp = smtplib.SMTP(settings.mail_host, settings.mail_port)
    with smtp:
        if settings.mail_port != 465:
            smtp.starttls(context=context)
        smtp.login(settings.mail_username, settings.mail_password)
        smtp.send_message(msg)
    logger.info("Email sent to %s", settings.mail_username)
