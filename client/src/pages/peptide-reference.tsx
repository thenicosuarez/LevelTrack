import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, X, Clock, Zap, ChevronRight, BookOpen } from "lucide-react";
import peptidesData from "@/data/peptides.json";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PeptideRef {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  mechanism: string;
  usage: string;
  halfLifeHours: number | null;
  typicalDoseRange: string;
  frequency: string;
}

const peptides = peptidesData as PeptideRef[];

const CATEGORIES = ["All", "GLP-1", "Regenerative", "Cognitive", "Metabolic", "Growth", "Other"];

const CATEGORY_COLORS: Record<string, string> = {
  "GLP-1":       "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Regenerative":"bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "Cognitive":   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Metabolic":   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Growth":      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Other":       "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

function formatHalfLife(hours: number | null): string {
  if (hours === null) return "N/A";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours} hr${hours !== 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""}`;
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function PeptideDetailSheet({
  peptide,
  open,
  onClose,
}: {
  peptide: PeptideRef | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!peptide) return null;

  const catColor = CATEGORY_COLORS[peptide.category] ?? CATEGORY_COLORS["Other"];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl px-5 pb-10">
        <SheetHeader className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-bold text-foreground leading-tight">
                {peptide.name}
              </SheetTitle>
              <p className="text-sm text-muted-foreground mt-0.5">{peptide.tagline}</p>
            </div>
            <Badge className={`${catColor} border-0 text-xs shrink-0 mt-0.5`}>
              {peptide.category}
            </Badge>
          </div>
        </SheetHeader>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-muted/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Half-life</span>
            </div>
            <p className="text-sm font-bold text-foreground">{formatHalfLife(peptide.halfLifeHours)}</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={12} className="text-muted-foreground" />
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Frequency</span>
            </div>
            <p className="text-sm font-bold text-foreground">{peptide.frequency}</p>
          </div>
        </div>

        {/* Typical dose */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-5">
          <p className="text-[10px] uppercase font-semibold text-primary tracking-wide mb-0.5">Typical Dose Range</p>
          <p className="text-sm font-semibold text-foreground">{peptide.typicalDoseRange}</p>
        </div>

        {/* Sections */}
        {[
          { label: "Overview", text: peptide.description },
          { label: "Mechanism of Action", text: peptide.mechanism },
          { label: "Usage & Administration", text: peptide.usage },
        ].map(({ label, text }) => (
          <div key={label} className="mb-4">
            <p className="text-xs font-bold text-foreground mb-1.5">{label}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
          </div>
        ))}

        <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed">
          This information is for educational purposes only and does not constitute medical advice. Consult a qualified healthcare provider before using any peptide or research compound.
        </p>
      </SheetContent>
    </Sheet>
  );
}

// ─── Reference Library ────────────────────────────────────────────────────────

export default function PeptideReferenceLibrary() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<PeptideRef | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return peptides.filter((p) => {
      const matchesCat = category === "All" || p.category === category;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [search, category]);

  function openDetail(p: PeptideRef) {
    setSelected(p);
    setSheetOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 gradient-primary rounded-lg flex items-center justify-center">
          <BookOpen size={13} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground leading-tight">Peptide Reference Library</h2>
          <p className="text-xs text-muted-foreground">{peptides.length} compounds &amp; agents</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-9 h-9 text-sm"
          placeholder="Search peptides…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              category === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Count */}
      {(search || category !== "All") && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No peptides found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const catColor = CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS["Other"];
            return (
              <button
                key={p.slug}
                className="w-full text-left"
                onClick={() => openDetail(p)}
              >
                <Card className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-foreground">{p.name}</span>
                          <Badge className={`${catColor} border-0 text-[10px] px-1.5 py-0`}>
                            {p.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{p.tagline}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            <span className="font-medium">t½</span> {formatHalfLife(p.halfLifeHours)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{p.frequency}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <PeptideDetailSheet
        peptide={selected}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

// ─── Hook: open detail for a named peptide ────────────────────────────────────

export function usePeptideRef() {
  const [selected, setSelected] = useState<PeptideRef | null>(null);
  const [open, setOpen] = useState(false);

  function openByName(name: string) {
    const found = peptides.find(
      (p) =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.slug === name.toLowerCase().replace(/\s+/g, "-") ||
        p.name.toLowerCase().includes(name.toLowerCase())
    );
    if (found) {
      setSelected(found);
      setOpen(true);
    }
  }

  const sheet = (
    <PeptideDetailSheet
      peptide={selected}
      open={open}
      onClose={() => setOpen(false)}
    />
  );

  return { openByName, sheet };
}
