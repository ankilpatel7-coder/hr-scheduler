"use client";
import { useRef, useState } from "react";
import Avatar from "./avatar";
import { Camera, X } from "lucide-react";

export default function PhotoUpload({
  name,
  photoUrl,
  onChange,
  disabled,
}: {
  name: string;
  photoUrl: string | null | undefined;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      if (!f.type.startsWith("image/")) {
        throw new Error("File must be an image");
      }
      if (f.size > 8 * 1024 * 1024) {
        throw new Error("Image must be under 8 MB");
      }
      const dataUrl = await compressImage(f, 400, 400, 0.85);
      onChange(dataUrl);
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name} photoUrl={photoUrl} size="xl" />
        {photoUrl && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            title="Remove photo"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
          disabled={disabled || busy}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy}
          className="btn btn-secondary !py-1.5"
        >
          <Camera size={14} /> {busy ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
        </button>
        {err && <div className="text-xs text-rose mt-2">{err}</div>}
        <div className="text-[10px] text-smoke font-mono uppercase tracking-widest mt-2">
          PNG / JPG · under 8 MB
        </div>
      </div>
    </div>
  );
}

async function compressImage(
  file: File,
  maxW: number,
  maxH: number,
  quality: number
): Promise<string> {
  const img = await fileToImage(file);
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = reader.result as string;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}
