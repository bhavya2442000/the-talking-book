from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.main as main
from app.store import BookStore


def sample_book() -> dict:
    return {
        "schema_version": 1,
        "id": "test-book",
        "title": "A Test Book",
        "author": "Test Author",
        "source_filename": "test.pdf",
        "source_sha256": "abc123",
        "page_count": 1,
        "word_count": 12,
        "section_count": 1,
        "paragraph_count": 1,
        "segment_count": 2,
        "sections": [
            {
                "index": 0,
                "title": "Chapter One",
                "level": 0,
                "page_start": 1,
                "page_end": 1,
                "segment_start": 0,
                "segment_end": 1,
            }
        ],
        "pages": [
            {
                "number": 1,
                "paragraph_start": 0,
                "paragraph_end": 0,
                "segment_start": 0,
                "segment_end": 1,
            }
        ],
        "paragraphs": [
            {
                "index": 0,
                "page": 1,
                "section": 0,
                "segment_start": 0,
                "segment_end": 1,
                "text": "This is the current passage. It has useful context.",
            }
        ],
        "segments": [
            {
                "index": 0,
                "page": 1,
                "section": 0,
                "paragraph": 0,
                "text": "This is the current passage.",
            },
            {
                "index": 1,
                "page": 1,
                "section": 0,
                "paragraph": 0,
                "text": "It has useful context.",
            },
        ],
    }


def configure_store(monkeypatch, tmp_path: Path) -> TestClient:
    store = BookStore(tmp_path / "books")
    store.save(sample_book())
    monkeypatch.setattr(main, "store", store)
    monkeypatch.setattr(main, "AUDIO_DIR", tmp_path / "audio")
    main.AUDIO_DIR.mkdir()
    main._openai_client.cache_clear()
    return TestClient(main.app)


def test_book_endpoints_and_no_key_explanation(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    assert client.get("/api/health").json() == {"status": "ok", "books": 1}
    assert client.get("/api/books").json()[0]["id"] == "test-book"
    assert client.get("/api/books/test-book").json()["segment_count"] == 2
    response = client.post(
        "/api/books/test-book/explain",
        json={"segment_index": 0, "question": "What does this mean?"},
    )
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_explanation_is_grounded_in_current_page(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    calls = []

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(output_text="A grounded explanation.")

    fake_client = SimpleNamespace(responses=FakeResponses())
    monkeypatch.setattr(main, "_openai_client", lambda: fake_client)

    response = client.post(
        "/api/books/test-book/explain",
        json={"segment_index": 1, "question": "Explain this."},
    )
    assert response.status_code == 200
    assert response.json()["answer"] == "A grounded explanation."
    assert "[PDF page 1]" in calls[0]["input"]
    assert "This is the current passage" in calls[0]["input"]
    assert "Reader question: Explain this." in calls[0]["input"]


def test_speech_audio_is_generated_and_cached(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    call_count = 0

    class FakeSpeech:
        def create(self, **kwargs):
            nonlocal call_count
            call_count += 1
            assert kwargs["input"] == "This is the current passage."
            return SimpleNamespace(content=b"fake-mp3")

    fake_client = SimpleNamespace(audio=SimpleNamespace(speech=FakeSpeech()))
    monkeypatch.setattr(main, "_openai_client", lambda: fake_client)

    first = client.post(
        "/api/books/test-book/speech",
        json={"segment_index": 0, "voice": "alloy"},
    )
    second = client.post(
        "/api/books/test-book/speech",
        json={"segment_index": 0, "voice": "alloy"},
    )
    assert first.content == b"fake-mp3"
    assert first.headers["x-audio-cache"] == "MISS"
    assert second.headers["x-audio-cache"] == "HIT"
    assert call_count == 1


def test_upload_rejects_non_pdf(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    response = client.post(
        "/api/books",
        files={"file": ("notes.txt", b"not a pdf", "text/plain")},
    )
    assert response.status_code == 415

