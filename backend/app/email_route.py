import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import mail
from .email_styles import EMAIL_STYLES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email")


class AttachmentBody(BaseModel):
    path: str
    filename: str = "attachment"


class EmailBody(BaseModel):
    subject: str | None = None
    message: str | None = None
    attachments: list[AttachmentBody] = []


def error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"success": False, "message": message})


# A plain function so FastAPI runs the blocking SMTP calls in a thread pool.
@router.post("/send")
def send(request: Request, body: EmailBody):
    if not body.subject or not body.message:
        return error(400, "Incorrect body")

    try:
        attachments = [mail.parse_data_uri(a.path, a.filename) for a in body.attachments]
    except ValueError as e:
        return error(400, str(e))

    settings = request.app.state.settings
    try:
        mail.send_email(
            settings,
            body.subject,
            f"<html><head>{EMAIL_STYLES}</head><body>{body.message}</body></html>",
            attachments,
        )
    except Exception:
        logger.exception("Email sending failed")
        return error(500, "Something went wrong.")

    return {"success": True, "message": f"Email sent to {settings.mail_username}"}
