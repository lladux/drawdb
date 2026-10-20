import base64

import pytest

from app import mail


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(mail, "send_email", lambda *args: calls.append(args))
    return calls


def test_send_wraps_message_and_decodes_attachments(client, sent):
    uri = "data:image/png;base64," + base64.b64encode(b"png-bytes").decode()
    res = client.post(
        "/email/send",
        json={
            "subject": "Bug",
            "message": "<p>broken</p>",
            "attachments": [{"path": uri, "filename": "shot.png"}],
        },
    )
    assert res.status_code == 200
    assert res.json() == {"success": True, "message": "Email sent to me@example.com"}

    _, subject, html, attachments = sent[0]
    assert subject == "Bug"
    assert html.startswith("<html><head><style>") and "<body><p>broken</p></body>" in html
    assert attachments == [mail.Attachment("shot.png", "image/png", b"png-bytes")]


@pytest.mark.parametrize("body", [{}, {"subject": "x"}, {"message": "x"}])
def test_missing_fields_is_400(client, sent, body):
    res = client.post("/email/send", json=body)
    assert res.status_code == 400
    assert res.json() == {"success": False, "message": "Incorrect body"}
    assert not sent


@pytest.mark.parametrize("path", ["/etc/passwd", "https://example.com/a.png", "data:text/plain,hi"])
def test_non_base64_data_uri_attachment_is_rejected(client, sent, path):
    res = client.post(
        "/email/send",
        json={"subject": "s", "message": "m", "attachments": [{"path": path, "filename": "f"}]},
    )
    assert res.status_code == 400
    assert not sent


def test_smtp_failure_is_500(client, monkeypatch):
    def fail(*args):
        raise OSError("connection refused")

    monkeypatch.setattr(mail, "send_email", fail)
    res = client.post("/email/send", json={"subject": "s", "message": "m"})
    assert res.status_code == 500
