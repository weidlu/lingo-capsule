mod input_monitor;
mod text_adapter;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use text_adapter::{
    AdapterEvent, CaptureRequest, CaptureResult, ClipboardCaptureRequest, ReplaceRequest,
    ReplaceResult,
};
use uuid::Uuid;

struct HistoryDb(Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionIssue {
    title: String,
    explanation_zh: String,
    excerpt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionSuggestion {
    id: String,
    label: String,
    rewrite: String,
    rationale_zh: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryInsertPayload {
    original_text: String,
    source_app: Option<String>,
    status: String,
    summary_zh: String,
    issues: Vec<CorrectionIssue>,
    suggestions: Vec<CorrectionSuggestion>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    id: String,
    created_at: i64,
    source_app: Option<String>,
    original_text: String,
    status: String,
    summary_zh: String,
    issues: Vec<CorrectionIssue>,
    suggestions: Vec<CorrectionSuggestion>,
    accepted_suggestion_id: Option<String>,
    accepted_rewrite: Option<String>,
    accepted_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSettings {
    base_url: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    wire_api: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSettingsStatus {
    configured: bool,
    base_url: String,
    model: String,
    wire_api: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn default_provider_base_url() -> String {
    "https://sub.slnt.dev".to_string()
}

fn default_provider_model() -> String {
    "gpt-5.4-mini".to_string()
}

fn default_provider_wire_api() -> String {
    "responses".to_string()
}

fn normalize_provider_wire_api(wire_api: Option<String>) -> String {
    match wire_api
        .unwrap_or_else(default_provider_wire_api)
        .trim()
        .to_lowercase()
        .as_str()
    {
        "chat" | "chat_completions" | "chat-completions" => "chat".to_string(),
        _ => "responses".to_string(),
    }
}

fn normalize_provider_base_url(base_url: Option<String>) -> String {
    let trimmed = base_url
        .unwrap_or_else(default_provider_base_url)
        .trim()
        .trim_end_matches('/')
        .to_string();

    if trimmed.is_empty() {
        default_provider_base_url()
    } else {
        trimmed
    }
}

fn provider_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("provider-settings.json"))
        .map_err(|error| error.to_string())
}

fn read_provider_settings_from_disk(app: &AppHandle) -> Result<Option<ProviderSettings>, String> {
    let path = provider_settings_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| format!("Provider settings JSON is invalid: {error}"))
}

fn provider_status(settings: Option<ProviderSettings>) -> ProviderSettingsStatus {
    let configured = settings
        .as_ref()
        .and_then(|value| value.api_key.as_ref())
        .is_some_and(|api_key| !api_key.trim().is_empty());

    ProviderSettingsStatus {
        configured,
        base_url: normalize_provider_base_url(
            settings.as_ref().and_then(|value| value.base_url.clone()),
        ),
        model: settings
            .as_ref()
            .and_then(|value| value.model.clone())
            .map(|model| model.trim().to_string())
            .filter(|model| !model.is_empty())
            .unwrap_or_else(default_provider_model),
        wire_api: normalize_provider_wire_api(settings.and_then(|value| value.wire_api)),
    }
}

fn build_correction_prompt(text: &str) -> String {
    [
        "You are Lingo Capsule, a quiet English writing companion for bilingual professionals.",
        "Diagnose whether the user text is already natural English or needs improvement.",
        "Preserve the user intent. Do not over-formalize. Return concise Chinese explanations.",
        "If improvement is useful, provide at most two rewrites: one Casual and one Professional.",
        "If the text is already natural, return status native, no issues, and no suggestions.",
        "",
        "User text:",
        text,
    ]
    .join("\n")
}

fn correction_response_schema() -> Value {
    json!({
        "name": "lingo_capsule_correction",
        "schema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["status", "summaryZh", "confidence", "issues", "suggestions"],
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["native", "needs_improvement"]
                },
                "summaryZh": {
                    "type": "string",
                    "description": "A concise Chinese summary of the diagnosis."
                },
                "confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                },
                "issues": {
                    "type": "array",
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["title", "explanationZh", "excerpt"],
                        "properties": {
                            "title": { "type": "string" },
                            "explanationZh": { "type": "string" },
                            "excerpt": { "type": "string" }
                        }
                    }
                },
                "suggestions": {
                    "type": "array",
                    "minItems": 0,
                    "maxItems": 2,
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["id", "label", "rewrite", "rationaleZh"],
                        "properties": {
                            "id": { "type": "string" },
                            "label": { "type": "string", "enum": ["Casual", "Professional"] },
                            "rewrite": { "type": "string" },
                            "rationaleZh": { "type": "string" }
                        }
                    }
                }
            }
        },
        "strict": true
    })
}

fn correction_chat_response_format() -> Value {
    json!({
        "type": "json_schema",
        "json_schema": correction_response_schema()
    })
}

fn correction_responses_text_format() -> Value {
    let mut format = correction_response_schema();
    if let Value::Object(ref mut map) = format {
        map.insert("type".to_string(), json!("json_schema"));
    }
    format
}

fn extract_provider_content_json(content: &str) -> Result<Value, String> {
    serde_json::from_str(content).or_else(|_| {
        let start = content
            .find('{')
            .ok_or_else(|| "Provider did not return JSON.".to_string())?;
        let end = content
            .rfind('}')
            .ok_or_else(|| "Provider did not return JSON.".to_string())?;

        serde_json::from_str(&content[start..=end]).map_err(|error| error.to_string())
    })
}

fn extract_responses_output_text(payload: &Value) -> Option<&str> {
    payload
        .get("output_text")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            payload
                .get("output")
                .and_then(Value::as_array)?
                .iter()
                .flat_map(|item| {
                    item.get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .find_map(|content| {
                    content
                        .get("text")
                        .and_then(Value::as_str)
                        .filter(|value| !value.trim().is_empty())
                })
        })
}

fn init_db(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS correction_history (
            id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            source_app TEXT,
            original_text TEXT NOT NULL,
            status TEXT NOT NULL,
            summary_zh TEXT NOT NULL,
            issues_json TEXT NOT NULL,
            suggestions_json TEXT NOT NULL,
            accepted_suggestion_id TEXT,
            accepted_rewrite TEXT,
            accepted_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS correction_history_created_at_idx
            ON correction_history(created_at DESC);

        CREATE TABLE IF NOT EXISTS text_adapter_events (
            id TEXT PRIMARY KEY,
            timestamp_ms INTEGER NOT NULL,
            event_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS text_adapter_events_timestamp_idx
            ON text_adapter_events(timestamp_ms DESC);
        "#,
    )
}

fn parse_json_column<T>(value: String) -> rusqlite::Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

fn row_to_entry(row: &Row<'_>) -> rusqlite::Result<HistoryEntry> {
    let issues_json: String = row.get("issues_json")?;
    let suggestions_json: String = row.get("suggestions_json")?;

    Ok(HistoryEntry {
        id: row.get("id")?,
        created_at: row.get("created_at")?,
        source_app: row.get("source_app")?,
        original_text: row.get("original_text")?,
        status: row.get("status")?,
        summary_zh: row.get("summary_zh")?,
        issues: parse_json_column(issues_json)?,
        suggestions: parse_json_column(suggestions_json)?,
        accepted_suggestion_id: row.get("accepted_suggestion_id")?,
        accepted_rewrite: row.get("accepted_rewrite")?,
        accepted_at: row.get("accepted_at")?,
    })
}

fn read_entry(conn: &Connection, id: &str) -> Result<Option<HistoryEntry>, String> {
    conn.query_row(
        "SELECT * FROM correction_history WHERE id = ?1",
        params![id],
        row_to_entry,
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn insert_adapter_event(conn: &Connection, event: &AdapterEvent) -> Result<(), String> {
    let event_json = serde_json::to_string(event).map_err(|error| error.to_string())?;
    let timestamp_ms = i64::try_from(event.timestamp_ms).unwrap_or(i64::MAX);

    conn.execute(
        r#"
        INSERT OR REPLACE INTO text_adapter_events (id, timestamp_ms, event_json)
        VALUES (?1, ?2, ?3)
        "#,
        params![&event.id, timestamp_ms, event_json],
    )
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn persist_adapter_event(db: &State<'_, HistoryDb>, event: &AdapterEvent) -> Result<(), String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    insert_adapter_event(&conn, event)
}

#[tauri::command]
fn history_insert_entry(
    db: State<'_, HistoryDb>,
    payload: HistoryInsertPayload,
) -> Result<HistoryEntry, String> {
    let id = Uuid::new_v4().to_string();
    let created_at = now_ms();
    let issues_json = serde_json::to_string(&payload.issues).map_err(|error| error.to_string())?;
    let suggestions_json =
        serde_json::to_string(&payload.suggestions).map_err(|error| error.to_string())?;
    let conn = db.0.lock().map_err(|error| error.to_string())?;

    conn.execute(
        r#"
        INSERT INTO correction_history (
            id,
            created_at,
            source_app,
            original_text,
            status,
            summary_zh,
            issues_json,
            suggestions_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![
            id,
            created_at,
            payload.source_app,
            payload.original_text,
            payload.status,
            payload.summary_zh,
            issues_json,
            suggestions_json
        ],
    )
    .map_err(|error| error.to_string())?;

    read_entry(&conn, &id)?.ok_or_else(|| "Inserted history entry was not found".to_string())
}

#[tauri::command]
fn history_accept_suggestion(
    db: State<'_, HistoryDb>,
    id: String,
    suggestion_id: String,
) -> Result<HistoryEntry, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    let entry = read_entry(&conn, &id)?.ok_or_else(|| "History entry not found".to_string())?;
    let suggestion = entry
        .suggestions
        .iter()
        .find(|candidate| candidate.id == suggestion_id)
        .ok_or_else(|| "Suggestion not found for history entry".to_string())?;
    let accepted_at = now_ms();

    conn.execute(
        r#"
        UPDATE correction_history
        SET accepted_suggestion_id = ?1,
            accepted_rewrite = ?2,
            accepted_at = ?3
        WHERE id = ?4
        "#,
        params![suggestion_id, suggestion.rewrite, accepted_at, id],
    )
    .map_err(|error| error.to_string())?;

    read_entry(&conn, &entry.id)?.ok_or_else(|| "Updated history entry was not found".to_string())
}

#[tauri::command]
fn history_list_entries(
    db: State<'_, HistoryDb>,
    limit: Option<i64>,
) -> Result<Vec<HistoryEntry>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    let limit = limit.unwrap_or(50).clamp(1, 200);
    let mut statement = conn
        .prepare("SELECT * FROM correction_history ORDER BY created_at DESC LIMIT ?1")
        .map_err(|error| error.to_string())?;
    let entries = statement
        .query_map(params![limit], row_to_entry)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(entries)
}

#[tauri::command]
fn capture_focused_text(
    request: Option<CaptureRequest>,
    db: State<'_, HistoryDb>,
) -> Result<CaptureResult, String> {
    match text_adapter::capture_focused_text(request.unwrap_or_default()) {
        Ok(result) => {
            let _ = persist_adapter_event(&db, &result.event);
            Ok(result)
        }
        Err(failure) => {
            let _ = persist_adapter_event(&db, &failure.event);
            Err(failure.message)
        }
    }
}

#[tauri::command]
fn capture_clipboard_text(
    request: Option<ClipboardCaptureRequest>,
    db: State<'_, HistoryDb>,
) -> Result<CaptureResult, String> {
    let request = request.unwrap_or(ClipboardCaptureRequest {
        max_chars: Some(1200),
    });

    match text_adapter::capture_clipboard_text(request) {
        Ok(result) => {
            let _ = persist_adapter_event(&db, &result.event);
            Ok(result)
        }
        Err(failure) => {
            let _ = persist_adapter_event(&db, &failure.event);
            Err(failure.message)
        }
    }
}

#[tauri::command]
fn replace_focused_text(
    request: ReplaceRequest,
    db: State<'_, HistoryDb>,
) -> Result<ReplaceResult, String> {
    match text_adapter::replace_focused_text(request) {
        Ok(result) => {
            let _ = persist_adapter_event(&db, &result.event);
            Ok(result)
        }
        Err(failure) => {
            let _ = persist_adapter_event(&db, &failure.event);
            Err(failure.message)
        }
    }
}

#[tauri::command]
fn list_text_adapter_events(
    db: State<'_, HistoryDb>,
    limit: Option<i64>,
) -> Result<Vec<AdapterEvent>, String> {
    let conn = db.0.lock().map_err(|error| error.to_string())?;
    let limit = limit.unwrap_or(100).clamp(1, 200);
    let mut statement = conn
        .prepare("SELECT event_json FROM text_adapter_events ORDER BY timestamp_ms DESC LIMIT ?1")
        .map_err(|error| error.to_string())?;
    let events = statement
        .query_map(params![limit], |row| {
            let event_json: String = row.get(0)?;
            parse_json_column(event_json)
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(events)
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    text_adapter::open_accessibility_settings()
}

#[tauri::command]
fn has_accessibility_permission() -> bool {
    text_adapter::has_accessibility_permission()
}

#[tauri::command]
fn start_input_monitor(app: AppHandle) -> Result<(), String> {
    input_monitor::start(app)
}

#[tauri::command]
fn open_input_monitoring_settings() -> Result<(), String> {
    input_monitor::open_settings()
}

#[tauri::command]
fn frontmost_app_name() -> Option<String> {
    text_adapter::frontmost_app_name()
}

#[tauri::command]
fn provider_settings_status(app: AppHandle) -> Result<ProviderSettingsStatus, String> {
    read_provider_settings_from_disk(&app).map(provider_status)
}

#[tauri::command]
async fn provider_analyze_text(app: AppHandle, text: String) -> Result<Value, String> {
    let settings = read_provider_settings_from_disk(&app)?
        .ok_or_else(|| "Provider settings are not configured.".to_string())?;
    let api_key = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Provider API key is not configured.".to_string())?;
    let base_url = normalize_provider_base_url(settings.base_url);
    let model = settings
        .model
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(default_provider_model);
    let wire_api = normalize_provider_wire_api(settings.wire_api);

    let (url, body) = if wire_api == "responses" {
        (
            format!("{base_url}/responses"),
            json!({
                "model": model,
                "input": [
                    {
                        "role": "system",
                        "content": "You return only structured JSON that matches the requested schema. Keep Chinese explanations concise and supportive."
                    },
                    {
                        "role": "user",
                        "content": build_correction_prompt(&text)
                    }
                ],
                "text": {
                    "format": correction_responses_text_format()
                }
            }),
        )
    } else {
        (
            format!("{base_url}/chat/completions"),
            json!({
                "model": model,
                "temperature": 0.2,
                "messages": [
                    {
                        "role": "system",
                        "content": "You return only structured JSON that matches the requested schema. Keep Chinese explanations concise and supportive."
                    },
                    {
                        "role": "user",
                        "content": build_correction_prompt(&text)
                    }
                ],
                "response_format": correction_chat_response_format()
            }),
        )
    };

    let response = reqwest::Client::new()
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let payload: Value = response.json().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Provider request failed.");
        return Err(format!("{message} (HTTP {})", status.as_u16()));
    }

    if let Some(refusal) = payload
        .pointer("/choices/0/message/refusal")
        .and_then(Value::as_str)
    {
        return Err(refusal.to_string());
    }

    let content = if wire_api == "responses" {
        extract_responses_output_text(&payload)
    } else {
        payload
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
    }
    .ok_or_else(|| "Provider returned no correction content.".to_string())?;

    extract_provider_content_json(content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("lingo-capsule.sqlite3");
            let conn = Connection::open(db_path)?;
            init_db(&conn)?;
            app.manage(HistoryDb(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            history_insert_entry,
            history_accept_suggestion,
            history_list_entries,
            capture_focused_text,
            capture_clipboard_text,
            replace_focused_text,
            list_text_adapter_events,
            open_accessibility_settings,
            has_accessibility_permission,
            start_input_monitor,
            open_input_monitoring_settings,
            frontmost_app_name,
            provider_settings_status,
            provider_analyze_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running LingoCapsule");
}

#[cfg(test)]
mod tests {
    use super::text_adapter::{AdapterOperation, AdapterPath, SupportTier};
    use super::*;

    #[test]
    fn persists_adapter_event_json_for_triage() {
        let conn = Connection::open_in_memory().expect("open test database");
        init_db(&conn).expect("initialize test schema");
        let event = AdapterEvent::new(
            AdapterOperation::Capture,
            false,
            Some("Slack".to_string()),
            SupportTier::TierB,
            AdapterPath::ClipboardCopy,
            42,
            vec!["AXValue:no_value".to_string()],
        );

        insert_adapter_event(&conn, &event).expect("insert adapter event");
        let stored_json: String = conn
            .query_row(
                "SELECT event_json FROM text_adapter_events WHERE id = ?1",
                params![&event.id],
                |row| row.get(0),
            )
            .expect("read adapter event");
        let stored_event: AdapterEvent =
            serde_json::from_str(&stored_json).expect("parse event JSON");

        assert_eq!(stored_event.id, event.id);
        assert_eq!(stored_event.failure_modes, vec!["AXValue:no_value"]);
        assert!(matches!(stored_event.support_tier, SupportTier::TierB));
    }
}
