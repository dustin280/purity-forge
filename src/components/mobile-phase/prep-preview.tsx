import { Card } from "@/components/ui/card";

export function PrepPreview({ text }: { text: string }) {
  return (
    <Card className="p-4 bg-muted/40">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Preparation
      </div>
      <pre className="text-xs sm:text-sm whitespace-pre-wrap font-mono leading-relaxed text-foreground">
        {text || "Fill in the form above to generate instructions."}
      </pre>
    </Card>
  );
}