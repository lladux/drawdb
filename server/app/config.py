import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

# Host and port for the MAIL_SERVICE values people commonly use. Any other
# provider can be configured with MAIL_HOST and MAIL_PORT.
SMTP_SERVICES = {
    "gmail": ("smtp.gmail.com", 465),
    "outlook": ("smtp-mail.outlook.com", 587),
    "hotmail": ("smtp-mail.outlook.com", 587),
    "outlook365": ("smtp.office365.com", 587),
    "yahoo": ("smtp.mail.yahoo.com", 465),
    "zoho": ("smtp.zoho.com", 465),
}


@dataclass(frozen=True)
class Settings:
    dev: bool = False
    github_token: str = ""
    port: int = 5000
    allowed_origins: list[str] = field(default_factory=list)
    mail_host: str = ""
    mail_port: int = 465
    mail_username: str = ""
    mail_password: str = ""


def load_settings() -> Settings:
    load_dotenv()

    service = os.getenv("MAIL_SERVICE", "gmail").lower()
    default_host, default_port = SMTP_SERVICES.get(service, ("", 465))
    origins = os.getenv("CLIENT_URLS", "")

    return Settings(
        dev=os.getenv("NODE_ENV") == "dev",
        github_token=os.getenv("GITHUB_TOKEN", ""),
        port=int(os.getenv("PORT", "5000")),
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()],
        mail_host=os.getenv("MAIL_HOST", default_host),
        mail_port=int(os.getenv("MAIL_PORT", str(default_port))),
        mail_username=os.getenv("MAIL_USERNAME", ""),
        mail_password=os.getenv("MAIL_PASSWORD", ""),
    )
