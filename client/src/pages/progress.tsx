import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Trash2, Share2, X, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ProgressPhoto, Glp1Log, User } from "@shared/schema";
import html2canvas from "html2canvas";
import { formatWeight, convertWeight } from "@/lib/weight-utils";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysBetween(a: string, b: string) {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.round(Math.abs(db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function compressImage(file: File, maxPx = 900, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function ShareCard({
  photo,
  photos,
  latestLog,
  adherence,
  weightUnit,
}: {
  photo: ProgressPhoto;
  photos: ProgressPhoto[];
  latestLog: Glp1Log | null;
  adherence: number;
  weightUnit: string;
}) {
  const sorted = [...photos].sort((a, b) => a.date.localeCompare(b.date));
  const firstPhoto = sorted[0];

  // Before/after: show side-by-side when earliest photo ≠ selected and both have images
  const photosWithImage = sorted.filter((p) => p.photoUrl);
  const beforePhoto = photosWithImage.length > 1 && photosWithImage[0].id !== photo.id
    ? photosWithImage[0]
    : null;
  const showBeforeAfter = beforePhoto !== null && photo.photoUrl != null;

  const weightLost =
    firstPhoto?.weight && photo.weight
      ? Math.round((firstPhoto.weight - photo.weight) * 10) / 10
      : null;
  const daysTracked = firstPhoto ? daysBetween(firstPhoto.date, photo.date) + 1 : 1;

  return (
    <div
      style={{
        width: 340,
        background: "linear-gradient(135deg, #3D27CC 0%, #0d9488 100%)",
        borderRadius: 20,
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#fff",
      }}
    >
      <div style={{ padding: "16px 18px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>📊</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>LevelTrack</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>My Progress Journey</div>
        </div>
      </div>

      {showBeforeAfter ? (
        <div style={{ margin: "0 14px", display: "flex", gap: 6 }}>
          <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", position: "relative" }}>
            <img
              src={beforePhoto!.photoUrl!}
              alt="Before"
              style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }}
              crossOrigin="anonymous"
            />
            <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>BEFORE</div>
          </div>
          <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", position: "relative" }}>
            <img
              src={photo.photoUrl!}
              alt="After"
              style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }}
              crossOrigin="anonymous"
            />
            <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>AFTER</div>
          </div>
        </div>
      ) : photo.photoUrl ? (
        <div style={{ margin: "0 14px", borderRadius: 12, overflow: "hidden" }}>
          <img
            src={photo.photoUrl}
            alt="Progress"
            style={{ width: "100%", height: 190, objectFit: "cover", display: "block" }}
            crossOrigin="anonymous"
          />
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 14px" }}>
        {[
          { label: "Current Weight", value: photo.weight ? formatWeight(photo.weight, weightUnit) : "—" },
          { label: "Weight Lost", value: weightLost != null && weightLost > 0 ? `-${convertWeight(weightLost, weightUnit)} ${weightUnit}` : "—" },
          { label: "Days Tracked", value: `${daysTracked}` },
          { label: "Shot Adherence", value: `${adherence}%` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.15)", borderRadius: 10,
            padding: "10px 12px",
          }}>
            <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </div>

      {latestLog && (
        <div style={{
          margin: "0 14px 12px",
          background: "rgba(255,255,255,0.12)", borderRadius: 9,
          padding: "9px 12px", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>💉</span>
          <div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>Current Protocol</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {latestLog.drugName} {latestLog.doseAmount}{latestLog.doseUnit}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "8px 18px 14px", fontSize: 9, opacity: 0.5, textAlign: "center" }}>
        {photo.date} · Track your journey with LevelTrack
      </div>
    </div>
  );
}

export default function Progress() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split("T")[0];

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [formWeight, setFormWeight] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [isCompressing, setIsCompressing] = useState(false);

  const { data: photos = [], isLoading } = useQuery<ProgressPhoto[]>({
    queryKey: ["/api/progress-photos"],
  });

  const { data: glp1Logs = [] } = useQuery<Glp1Log[]>({
    queryKey: ["/api/glp1-logs"],
  });

  const { data: dashboardData } = useQuery<{ glp1Adherence: number }>({
    queryKey: ["/api/analytics/dashboard"],
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const weightUnit = user?.weightUnit ?? "lbs";

  const sortedPhotos = [...photos].sort((a, b) => b.date.localeCompare(a.date));
  const latestLog = glp1Logs.length > 0
    ? [...glp1Logs].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;

  const createPhotoMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/progress-photos", {
        date: today,
        photoUrl: pendingImage || null,
        weight: formWeight ? parseFloat(formWeight) : null,
        notes: formNotes || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/progress-photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({ title: "Saved!", description: "Progress entry added." });
      setPendingImage(null);
      setFormWeight("");
      setFormNotes("");
      setShowAddForm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save entry.", variant: "destructive" });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/progress-photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/progress-photos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({ title: "Deleted", description: "Entry removed." });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const compressed = await compressImage(file);
      setPendingImage(compressed);
      setShowAddForm(true);
    } catch {
      toast({ title: "Error", description: "Could not process image.", variant: "destructive" });
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerateCard = async () => {
    if (!shareCardRef.current || !selectedPhoto) return;
    setIsGeneratingCard(true);
    try {
      const canvas = await html2canvas(shareCardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png", 0.95));
      const file = new File([blob], "leveltrack-progress.png", { type: "image/png" });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My LevelTrack Progress", text: "Check out my GLP-1 progress! 💉📊" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "leveltrack-progress.png";
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Downloaded!", description: "Progress card saved to your device." });
      }
    } catch {
      toast({ title: "Error", description: "Could not generate card.", variant: "destructive" });
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const withWeight = photos.filter((p) => p.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const currentWeight = withWeight.length > 0 ? withWeight[withWeight.length - 1].weight : null;
  const startWeight = withWeight.length > 0 ? withWeight[0].weight : null;
  const weightLost = currentWeight && startWeight ? Math.round((startWeight - currentWeight) * 10) / 10 : null;

  return (
    <div className="px-4 py-5 space-y-5">

      {/* Stats strip */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-primary">{photos.length}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Photos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-secondary">
                {currentWeight ? convertWeight(currentWeight, weightUnit) : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Current {weightUnit}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className={`text-xl font-bold ${weightLost != null && weightLost > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                {weightLost != null && weightLost > 0 ? `-${convertWeight(weightLost, weightUnit)}` : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{weightUnit} lost</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          className="flex-1 h-12 gap-2 gradient-primary text-white border-0 font-semibold"
          onClick={() => fileInputRef.current?.click()}
          disabled={isCompressing}
        >
          {isCompressing ? "Compressing..." : (
            <>
              <Camera size={18} />
              Add Photo
            </>
          )}
        </Button>
        <Button
          variant="outline"
          className="h-12 px-4 gap-2"
          onClick={() => { setPendingImage(null); setShowAddForm(true); }}
        >
          <Scale size={16} />
          <span className="text-sm">Weight</span>
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                {pendingImage ? "Add Photo Entry" : "Log Weight / Note"}
              </h3>
              <button onClick={() => { setShowAddForm(false); setPendingImage(null); }}>
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {pendingImage && (
              <div className="relative rounded-xl overflow-hidden">
                <img src={pendingImage} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Weight ({weightUnit})</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 185.5"
                  className="h-11"
                  value={formWeight}
                  onChange={(e) => setFormWeight(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Date</Label>
                <Input type="date" className="h-11" value={today} readOnly />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                placeholder="How are you feeling? Any milestones?"
                className="resize-none text-sm"
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            <Button
              className="w-full h-11 gradient-primary text-white border-0 font-semibold"
              onClick={() => createPhotoMutation.mutate()}
              disabled={createPhotoMutation.isPending}
            >
              {createPhotoMutation.isPending ? "Saving..." : "Save Entry"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Photo grid */}
      {isLoading ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">Loading...</CardContent></Card>
      ) : sortedPhotos.length === 0 && !showAddForm ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
              <Camera size={28} className="text-primary/40" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No entries yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add a photo or log your weight to track your journey</p>
            </div>
          </CardContent>
        </Card>
      ) : sortedPhotos.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Timeline</h3>
            <span className="text-xs text-muted-foreground">{sortedPhotos.length} entries</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {sortedPhotos.map((photo) => (
              <Card key={photo.id} className="overflow-hidden">
                <div
                  className="relative cursor-pointer"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  {photo.photoUrl ? (
                    <img
                      src={photo.photoUrl}
                      alt={`Progress ${photo.date}`}
                      className="w-full h-40 object-cover"
                    />
                  ) : (
                    <div className="w-full h-40 bg-muted flex flex-col items-center justify-center gap-1.5">
                      <Scale size={24} className="text-muted-foreground/40" />
                      {photo.weight && (
                        <span className="text-sm font-bold text-muted-foreground">{formatWeight(photo.weight, weightUnit)}</span>
                      )}
                    </div>
                  )}
                  <div className="absolute top-2 right-2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center">
                    <Share2 size={13} className="text-white" />
                  </div>
                </div>
                <CardContent className="p-3 space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">{formatDate(photo.date)}</p>
                  {photo.weight && (
                    <p className="text-xs text-muted-foreground">{formatWeight(photo.weight, weightUnit)}</p>
                  )}
                  {photo.notes && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 italic">{photo.notes}</p>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePhotoMutation.mutate(photo.id); }}
                    disabled={deletePhotoMutation.isPending}
                    className="mt-1 p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* Share card modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col">
          <div className="flex items-center justify-between p-4 shrink-0">
            <h3 className="text-white font-bold text-base">Progress Card</h3>
            <button onClick={() => setSelectedPhoto(null)} className="text-white">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col items-center px-4 pb-8 gap-5">
            <div ref={shareCardRef} className="mx-auto">
              <ShareCard
                photo={selectedPhoto}
                photos={photos}
                latestLog={latestLog}
                adherence={dashboardData?.glp1Adherence ?? 0}
                weightUnit={weightUnit}
              />
            </div>

            <p className="text-white/50 text-xs text-center">Tap "Share" to export or long-press to save</p>

            <div className="w-full max-w-xs space-y-2.5">
              <Button
                className="w-full h-12 bg-white text-primary font-semibold hover:bg-white/90 gap-2"
                onClick={handleGenerateCard}
                disabled={isGeneratingCard}
              >
                <Share2 size={17} />
                {isGeneratingCard ? "Generating..." : "Share / Save Image"}
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 text-white border-white/30 hover:bg-white/10"
                onClick={() => setSelectedPhoto(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
