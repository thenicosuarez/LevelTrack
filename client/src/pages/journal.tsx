import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function Journal() {
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center space-x-3 mb-2">
        <div className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center">
          <BookOpen className="text-white" size={18} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Symptom Journal</h2>
          <p className="text-sm text-muted-foreground">Track how you're feeling today</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <BookOpen size={40} className="mx-auto mb-3 text-primary/40" />
          <p className="font-medium text-foreground">Symptom journaling coming soon</p>
          <p className="text-sm mt-1">Side effect and symptom tracking will be available in the next update</p>
        </CardContent>
      </Card>
    </div>
  );
}
