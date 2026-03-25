import { Card, CardContent } from "@/components/ui/card";
import { Syringe } from "lucide-react";

export default function LogShot() {
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center space-x-3 mb-2">
        <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center">
          <Syringe className="text-white" size={18} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Log a Shot</h2>
          <p className="text-sm text-muted-foreground">Record your GLP-1 or peptide injection</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Syringe size={40} className="mx-auto mb-3 text-primary/40" />
          <p className="font-medium text-foreground">Shot logging coming soon</p>
          <p className="text-sm mt-1">Full injection form will be available in the next update</p>
        </CardContent>
      </Card>
    </div>
  );
}
