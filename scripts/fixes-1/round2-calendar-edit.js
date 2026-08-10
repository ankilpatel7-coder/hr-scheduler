/**
 * ROUND 2 — calendar event editing.
 *
 * Adds an Edit button to each event in the upcoming list. Reuses the existing
 * create modal in "edit" mode: seeds fields from the event, PATCHes instead of
 * POSTs, and lets the admin replace or remove the PDF attachment.
 *
 * Every anchor below is verbatim from the file as shipped in commit a7b6904.
 * If an anchor doesn't match, that hunk is skipped and nothing is written
 * for it — the script reports which one failed.
 *
 * Idempotent.
 */

const fs = require("fs");
const file = "src/app/[tenant]/calendar/calendar-view.tsx";

if (!fs.existsSync(file)) {
  console.log(`  ! ${file} NOT FOUND — aborting, nothing changed`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");
const original = s;
let ok = 0;
let failed = 0;

function hunk(name, find, replace, marker) {
  if (marker && s.includes(marker)) {
    console.log(`  = ${name}: already applied`);
    return;
  }
  if (!s.includes(find)) {
    console.log(`  ! ${name}: ANCHOR NOT FOUND`);
    failed++;
    return;
  }
  s = s.replace(find, replace);
  console.log(`  + ${name}`);
  ok++;
}

// ---- 1. import Pencil icon ----
hunk(
  "import Pencil",
  `import { Plus, Paperclip, X, ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";`,
  `import { Plus, Paperclip, X, ChevronLeft, ChevronRight, Trash2, Upload, Pencil } from "lucide-react";`,
  `Trash2, Upload, Pencil }`,
);

// ---- 2. editing state ----
hunk(
  "editing state",
  `  const [showForm, setShowForm] = useState(false);`,
  `  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);`,
  `const [editingEvent, setEditingEvent]`,
);

// ---- 3. Edit button beside Delete in the upcoming list ----
hunk(
  "Edit button in upcoming list",
  `                    {canManage && (
                      <button
                        onClick={() => onDelete(e.id)}
                        className="text-[11px] text-smoke hover:text-rose inline-flex items-center gap-1"
                        title="Delete event"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}`,
  `                    {canManage && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setEditingEvent(e)}
                          className="text-[11px] text-smoke hover:text-rust inline-flex items-center gap-1"
                          title="Edit event"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => onDelete(e.id)}
                          className="text-[11px] text-smoke hover:text-rose inline-flex items-center gap-1"
                          title="Delete event"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}`,
  `title="Edit event"`,
);

// ---- 4. render modal for create OR edit ----
hunk(
  "modal render handles edit",
  `      {showForm && canManage && (
        <EventFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}`,
  `      {(showForm || editingEvent) && canManage && (
        <EventFormModal
          event={editingEvent}
          onClose={() => {
            setShowForm(false);
            setEditingEvent(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingEvent(null);
            router.refresh();
          }}
        />
      )}`,
  `event={editingEvent}`,
);

// ---- 5. modal accepts an optional event and seeds state from it ----
hunk(
  "modal props + seeded state",
  `function EventFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<EventType>("EVENT");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);`,
  `function EventFormModal({
  event,
  onClose,
  onSaved,
}: {
  event?: Event | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(event);
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "EVENT");
  const [startDate, setStartDate] = useState(
    event?.startDate ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(
    event?.endDate ?? format(new Date(), "yyyy-MM-dd"),
  );
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);`,
  `const isEdit = Boolean(event);`,
);

// ---- 6. submit: PATCH when editing ----
hunk(
  "submit PATCH vs POST",
  `      if (file) fd.append("file", file);

      const r = await fetch("/api/calendar-events", {
        method: "POST",
        body: fd,
      });`,
  `      if (file) fd.append("file", file);
      if (isEdit && removeAttachment) fd.append("removeAttachment", "true");

      const r = await fetch(
        isEdit ? \`/api/calendar-events/\${event!.id}\` : "/api/calendar-events",
        {
          method: isEdit ? "PATCH" : "POST",
          body: fd,
        },
      );`,
  `isEdit ? "PATCH" : "POST"`,
);

// ---- 7. modal title ----
hunk(
  "modal heading",
  `          <div className="text-sm font-medium text-ink">New event</div>`,
  `          <div className="text-sm font-medium text-ink">
            {isEdit ? "Edit event" : "New event"}
          </div>`,
  `{isEdit ? "Edit event" : "New event"}`,
);

// ---- 8. existing-attachment row + submit label ----
hunk(
  "existing attachment controls",
  `            <div className="text-[10px] text-smoke mt-1">Max 15 MB. PDF only.</div>`,
  `            <div className="text-[10px] text-smoke mt-1">Max 15 MB. PDF only.</div>
            {isEdit && event?.attachmentName && !file && (
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                {removeAttachment ? (
                  <>
                    <span className="text-rose line-through truncate">
                      {event.attachmentName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemoveAttachment(false)}
                      className="text-smoke hover:text-ink underline"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <Paperclip size={11} className="text-smoke" />
                    <span className="text-smoke truncate flex-1">
                      {event.attachmentName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemoveAttachment(true)}
                      className="text-rose hover:underline"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )}`,
  `onClick={() => setRemoveAttachment(true)}`,
);

hunk(
  "submit button label",
  `              {busy ? "Saving…" : "Create event"}`,
  `              {busy ? "Saving…" : isEdit ? "Save changes" : "Create event"}`,
  `isEdit ? "Save changes" : "Create event"`,
);

if (failed > 0) {
  console.log(`\n!! ${failed} hunk(s) failed — NOT writing file. Nothing changed.`);
  process.exit(1);
}

if (s !== original) {
  fs.writeFileSync(file, s);
  console.log(`\n=== ${ok} hunk(s) applied ===`);
} else {
  console.log("\n=== no changes needed ===");
}
