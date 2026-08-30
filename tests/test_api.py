from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace

import httpx
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


def context_book() -> dict:
    book = sample_book()
    book.update(
        page_count=3,
        word_count=16,
        paragraph_count=3,
        segment_count=3,
    )
    book["sections"][0].update(page_end=3, segment_end=2)
    book["pages"] = [
        {
            "number": index + 1,
            "paragraph_start": index,
            "paragraph_end": index,
            "segment_start": index,
            "segment_end": index,
        }
        for index in range(3)
    ]
    texts = [
        "This is the opening passage.",
        "This is the middle passage.",
        "This is the closing passage.",
    ]
    book["paragraphs"] = [
        {
            "index": index,
            "page": index + 1,
            "section": 0,
            "segment_start": index,
            "segment_end": index,
            "text": text,
        }
        for index, text in enumerate(texts)
    ]
    book["segments"] = [
        {
            "index": index,
            "page": index + 1,
            "section": 0,
            "paragraph": index,
            "text": text,
        }
        for index, text in enumerate(texts)
    ]
    return book


def configure_store(monkeypatch, tmp_path: Path, book: dict | None = None) -> TestClient:
    store = BookStore(tmp_path / "books")
    store.save(book or sample_book())
    monkeypatch.setattr(main, "store", store)
    monkeypatch.setattr(main, "AUDIO_DIR", tmp_path / "audio")
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path / "uploads")
    main.AUDIO_DIR.mkdir()
    main.UPLOAD_DIR.mkdir()
    main._openai_client.cache_clear()
    return TestClient(main.app)


def test_book_endpoints_and_no_key_explanation(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    assert client.get("/api/health").json() == {"status": "ok", "books": 1}
    assert client.get("/api/config").json()["realtime_configured"] is False
    assert client.get("/api/books").json()[0]["id"] == "test-book"
    assert client.get("/api/books/test-book").json()["segment_count"] == 2
    response = client.post(
        "/api/books/test-book/explain",
        json={"segment_index": 0, "question": "What does this mean?"},
    )
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]
    realtime = client.post(
        "/api/books/test-book/realtime",
        json={"sdp": "v=0", "segment_index": 0, "recent_turns": []},
    )
    assert realtime.status_code == 503


def test_book_titles_remove_download_site_suffix(monkeypatch, tmp_path: Path) -> None:
    book = sample_book()
    book["title"] = "Sapiens: A Brief History of Humankind - PDFDrive.com"
    client = configure_store(monkeypatch, tmp_path, book)

    assert client.get("/api/books").json()[0]["title"] == (
        "Sapiens: A Brief History of Humankind"
    )
    assert client.get("/api/books/test-book").json()["title"] == (
        "Sapiens: A Brief History of Humankind"
    )


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


def test_research_is_anchored_to_the_passage_and_returns_sources(
    monkeypatch, tmp_path: Path
) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_RESEARCH_MODEL", "research-test-model")
    calls = []

    class FakeResponse:
        output_text = "A concise researched connection."

        def model_dump(self):
            return {
                "output": [{
                    "type": "web_search_call",
                    "action": {
                        "sources": [
                            {"title": "Primary source", "url": "https://example.com/source"},
                            {"title": "Duplicate", "url": "https://example.com/source"},
                        ]
                    },
                }]
            }

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return FakeResponse()

    monkeypatch.setattr(
        main,
        "_openai_client",
        lambda: SimpleNamespace(responses=FakeResponses()),
    )

    response = client.post(
        "/api/books/test-book/research",
        json={
            "segment_index": 1,
            "scope": "sentence",
            "query": "Where did this idea originate?",
        },
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "A concise researched connection."
    assert response.json()["page"] == 1
    assert response.json()["sources"] == [
        {"title": "Primary source", "url": "https://example.com/source"}
    ]
    assert calls[0]["model"] == "research-test-model"
    assert calls[0]["tools"] == [{"type": "web_search"}]
    assert calls[0]["include"] == ["web_search_call.action.sources"]
    assert "Anchored physical PDF page: 1" in calls[0]["input"]
    assert "Anchored sentence: It has useful context." in calls[0]["input"]
    assert "Research question: Where did this idea originate?" in calls[0]["input"]


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


def test_invalid_book_and_segment_identifiers_return_404(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    assert client.get("/api/books/missing-book").status_code == 404
    explanation = client.post(
        "/api/books/test-book/explain",
        json={"segment_index": 99, "question": "Explain this."},
    )
    narration = client.post(
        "/api/books/test-book/speech",
        json={"segment_index": 99, "voice": "alloy"},
    )
    realtime = client.post(
        "/api/books/test-book/realtime",
        json={"sdp": "v=0", "segment_index": 99, "recent_turns": []},
    )
    assert explanation.status_code == 404
    assert narration.status_code == 404
    assert realtime.status_code == 404


def test_realtime_handoff_is_grounded_and_returns_answer_sdp(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path, context_book())
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_REALTIME_MODEL", "realtime-test-model")
    monkeypatch.setenv("OPENAI_REALTIME_VOICE", "marin")
    calls = []

    async def fake_offer(sdp, session):
        calls.append((sdp, session))
        return httpx.Response(201, text="v=0\r\na=answer")

    monkeypatch.setattr(main, "_post_realtime_offer", fake_offer)
    response = client.post(
        "/api/books/test-book/realtime",
        json={
            "sdp": "v=0\r\na=offer",
            "segment_index": 1,
            "recent_turns": [
                {"role": "user", "text": "Who is speaking?"},
                {"role": "assistant", "text": "The excerpt does not name them."},
            ],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/sdp")
    assert response.text == "v=0\r\na=answer"
    offer, session = calls[0]
    assert offer == "v=0\r\na=offer"
    assert session["type"] == "realtime"
    assert session["model"] == "realtime-test-model"
    assert session["audio"]["output"]["voice"] == "marin"
    assert session["audio"]["input"]["turn_detection"]["create_response"] is True
    assert session["tool_choice"] == "auto"
    tools = {tool["name"]: tool for tool in session["tools"]}
    assert set(tools) == {"control_reader", "annotate_book"}
    assert tools["control_reader"]["parameters"]["properties"]["action"]["enum"] == [
        "continue",
        "repeat",
    ]
    annotation_parameters = tools["annotate_book"]["parameters"]
    assert annotation_parameters["properties"]["action"]["enum"] == [
        "note",
        "highlight",
        "research",
    ]
    assert annotation_parameters["properties"]["scope"]["enum"] == [
        "sentence",
        "paragraph",
    ]
    assert annotation_parameters["required"] == ["action", "scope", "text"]
    assert annotation_parameters["additionalProperties"] is False
    assert "[PDF page 1]" in session["instructions"]
    assert "[PDF page 2]" in session["instructions"]
    assert "[PDF page 3]" in session["instructions"]
    assert "Who is speaking?" in session["instructions"]
    assert "untrusted reference data" in session["instructions"]
    assert "control_reader" in session["instructions"]
    assert "annotate_book" in session["instructions"]
    assert "Wait silently when the session connects" in session["instructions"]
    assert "Stopped sentence: This is the middle passage." in session["instructions"]
    assert "Stopped paragraph: This is the middle passage." in session["instructions"]


def test_library_realtime_welcome_lists_real_books_and_one_validated_tool(
    monkeypatch,
    tmp_path: Path,
) -> None:
    first = sample_book()
    first["title"] = "Sapiens - PDFDrive.com"
    client = configure_store(monkeypatch, tmp_path, first)
    second = sample_book()
    second.update(id="book-two", title="A Second Book", author="Another Author")
    main.store.save(second)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    calls = []

    async def fake_offer(sdp, session):
        calls.append((sdp, session))
        return httpx.Response(201, text="v=0\r\na=answer")

    monkeypatch.setattr(main, "_post_realtime_offer", fake_offer)
    response = client.post(
        "/api/realtime/library",
        json={"sdp": "v=0\r\na=offer", "recent_turns": []},
    )

    assert response.status_code == 200
    offer, session = calls[0]
    assert offer == "v=0\r\na=offer"
    assert session["output_modalities"] == ["audio"]
    assert session["tool_choice"] == "auto"
    assert len(session["tools"]) == 1
    tool = session["tools"][0]
    assert tool["name"] == "welcome_reader"
    assert set(tool["parameters"]["properties"]["book_id"]["enum"]) == {
        "test-book",
        "book-two",
    }
    assert tool["parameters"]["required"] == ["action", "book_id", "start"]
    assert tool["parameters"]["additionalProperties"] is False
    assert "PDFDrive.com" not in session["instructions"]
    assert "title=Sapiens;" in session["instructions"]
    assert "title=A Second Book;" in session["instructions"]
    assert "Never invent a book id" in session["instructions"]
    assert "Never start book text immediately after book selection" in session["instructions"]


def test_realtime_handoff_maps_upstream_failures(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    async def rejected_offer(sdp, session):
        return httpx.Response(429, text="rate limited")

    monkeypatch.setattr(main, "_post_realtime_offer", rejected_offer)
    response = client.post(
        "/api/books/test-book/realtime",
        json={"sdp": "v=0", "segment_index": 0, "recent_turns": []},
    )
    assert response.status_code == 502
    assert "(429)" in response.json()["detail"]


def test_upload_rejects_oversized_pdf(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 8)

    response = client.post(
        "/api/books",
        files={"file": ("large.pdf", b"%PDF-1234", "application/pdf")},
    )
    assert response.status_code == 413


def test_upload_rejects_pdf_extension_with_invalid_signature(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)

    response = client.post(
        "/api/books",
        files={"file": ("fake.pdf", b"definitely not a pdf", "application/pdf")},
    )
    assert response.status_code == 415


def test_duplicate_upload_returns_existing_book_without_extraction(
    monkeypatch,
    tmp_path: Path,
) -> None:
    payload = b"%PDF-existing-book"
    book = sample_book()
    book["source_sha256"] = sha256(payload).hexdigest()
    client = configure_store(monkeypatch, tmp_path, book)

    def unexpected_extraction(*args, **kwargs):
        raise AssertionError("duplicate PDF should not be extracted again")

    monkeypatch.setattr(main, "extract_book", unexpected_extraction)
    response = client.post(
        "/api/books",
        files={"file": ("duplicate.pdf", payload, "application/pdf")},
    )

    assert response.status_code == 201
    assert response.json()["id"] == "test-book"
    assert list(main.UPLOAD_DIR.iterdir()) == []


def test_new_upload_runs_and_saves_the_opening_mapper(
    monkeypatch, tmp_path: Path
) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_TEXT_MODEL", "opening-test-model")
    fake_openai = object()
    calls = []

    def fake_extract(_path, *, book_id):
        book = sample_book()
        book["id"] = book_id
        book["source_sha256"] = sha256(b"%PDF-new-book").hexdigest()
        return book

    def fake_map(book, *, client, model):
        calls.append((client, model))
        book["opening_plan"] = {"status": "ready", "method": "test"}
        return book

    monkeypatch.setattr(main, "extract_book", fake_extract)
    monkeypatch.setattr(main, "map_book_opening", fake_map)
    monkeypatch.setattr(main, "_openai_client", lambda: fake_openai)

    response = client.post(
        "/api/books",
        files={"file": ("new.pdf", b"%PDF-new-book", "application/pdf")},
    )

    assert response.status_code == 201
    saved = client.get(f"/api/books/{response.json()['id']}").json()
    assert saved["opening_plan"] == {"status": "ready", "method": "test"}
    assert calls == [(fake_openai, "opening-test-model")]


def test_reindex_uses_original_pdf_and_remaps_saved_sentence(
    monkeypatch, tmp_path: Path
) -> None:
    payload = b"%PDF-original-book"
    book = sample_book()
    book["source_sha256"] = sha256(payload).hexdigest()
    client = configure_store(monkeypatch, tmp_path, book)
    source_path = main.UPLOAD_DIR / "test-book.pdf"
    source_path.write_bytes(payload)
    calls = []

    def fake_extract(path, *, book_id):
        calls.append((path, book_id))
        refreshed = sample_book()
        refreshed["segments"] = [
            {
                "index": 0,
                "page": 1,
                "section": 0,
                "paragraph": 0,
                "text": "A newly detected opening sentence.",
            },
            *[
                {**segment, "index": segment["index"] + 1}
                for segment in refreshed["segments"]
            ],
        ]
        refreshed["segment_count"] = 3
        return refreshed

    def fake_map(refreshed, *, client, model):
        refreshed["opening_plan"] = {"status": "ready", "method": "test"}
        return refreshed

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(main, "extract_book", fake_extract)
    monkeypatch.setattr(main, "map_book_opening", fake_map)

    response = client.post(
        "/api/books/test-book/reindex",
        json={"segment_index": 1},
    )

    assert response.status_code == 200
    assert response.json() == {
        "book_id": "test-book",
        "segment_index": 2,
        "cursor_status": "exact",
        "opening_status": "ready",
    }
    assert calls == [(source_path, "test-book")]
    assert source_path.read_bytes() == payload
    saved = client.get("/api/books/test-book").json()
    assert saved["source_filename"] == "test.pdf"
    assert saved["opening_plan"] == {"status": "ready", "method": "test"}


def test_explanation_context_is_bounded_at_book_edges(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path, context_book())
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    calls = []

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(output_text="A bounded explanation.")

    monkeypatch.setattr(
        main,
        "_openai_client",
        lambda: SimpleNamespace(responses=FakeResponses()),
    )

    first = client.post(
        "/api/books/test-book/explain",
        json={"segment_index": 0, "question": "Explain the opening."},
    )
    last = client.post(
        "/api/books/test-book/explain",
        json={"segment_index": 2, "question": "Explain the ending."},
    )

    assert first.status_code == 200
    assert last.status_code == 200
    assert "[PDF page 1]" in calls[0]["input"]
    assert "[PDF page 2]" in calls[0]["input"]
    assert "closing passage" not in calls[0]["input"]
    assert "opening passage" not in calls[1]["input"]
    assert "[PDF page 2]" in calls[1]["input"]
    assert "[PDF page 3]" in calls[1]["input"]


def test_audio_cache_separates_models_and_voices(monkeypatch, tmp_path: Path) -> None:
    client = configure_store(monkeypatch, tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_TTS_MODEL", "tts-model-a")
    calls = []

    class FakeSpeech:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(content=f"audio-{len(calls)}".encode())

    monkeypatch.setattr(
        main,
        "_openai_client",
        lambda: SimpleNamespace(audio=SimpleNamespace(speech=FakeSpeech())),
    )

    first_voice = client.post(
        "/api/books/test-book/speech",
        json={"segment_index": 0, "voice": "alloy"},
    )
    second_voice = client.post(
        "/api/books/test-book/speech",
        json={"segment_index": 0, "voice": "echo"},
    )
    monkeypatch.setenv("OPENAI_TTS_MODEL", "tts-model-b")
    second_model = client.post(
        "/api/books/test-book/speech",
        json={"segment_index": 0, "voice": "alloy"},
    )

    assert [response.headers["x-audio-cache"] for response in (
        first_voice,
        second_voice,
        second_model,
    )] == ["MISS", "MISS", "MISS"]
    assert [(call["model"], call["voice"]) for call in calls] == [
        ("tts-model-a", "alloy"),
        ("tts-model-a", "echo"),
        ("tts-model-b", "alloy"),
    ]
    assert len(list(main.AUDIO_DIR.glob("*.mp3"))) == 3
