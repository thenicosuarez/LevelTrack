import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Camera, Upload, X, Check, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface LabelScannerProps {
  onProtocolCreated?: () => void;
}

interface ScanResult {
  supplementName: string;
  brand: string;
  dosageAmount: string;
  dosageUnit: string;
  servingSize: string;
  ingredients: string[];
  confidence: number;
  suggestions: string[];
}

export default function LabelScanner({ onProtocolCreated }: LabelScannerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [images, setImages] = useState<File[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const scanLabelMutation = useMutation({
    mutationFn: async (imageFiles: File[]) => {
      const formData = new FormData();
      imageFiles.forEach((file, index) => {
        formData.append(`image${index}`, file);
      });

      // FormData upload, so call fetch directly rather than the JSON apiRequest helper.
      const response = await fetch("/api/scan-label", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
      return (await response.json()) as ScanResult;
    },
    onSuccess: (result: ScanResult) => {
      setScanResult(result);
      toast({
        title: "Label Scanned Successfully",
        description: `Found ${result.supplementName} with ${result.confidence}% confidence`,
      });
    },
    onError: (error) => {
      toast({
        title: "Scan Failed",
        description: "Unable to process the label images. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createProtocolFromScan = useMutation({
    mutationFn: async (scanData: ScanResult) => {
      const protocolRes = await apiRequest("POST", "/api/protocols", {
        name: scanData.supplementName,
        description: `${scanData.brand} - Scanned from label`,
        category: "supplements",
        isActive: true,
        color: "#14B8A6",
        goals: [],
      });
      const protocol = await protocolRes.json();

      // Create protocol item
      const itemRes = await apiRequest("POST", `/api/protocols/${protocol.id}/items`, {
        name: scanData.supplementName,
        dosageAmount: parseFloat(scanData.dosageAmount) || null,
        dosageUnit: scanData.dosageUnit,
        formFactor: "capsule",
        timing: "08:00",
        frequency: "daily",
        instructions: `Take ${scanData.servingSize} daily`,
        order: 0,
      });

      return { protocol, item: await itemRes.json() };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/protocols"] });
      toast({
        title: "Protocol Created",
        description: "Your supplement protocol has been added successfully!",
      });
      onProtocolCreated?.();
      resetScanner();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create protocol from scan",
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      const newImages = [...images, ...files].slice(0, 3); // Max 3 images
      setImages(newImages);
      
      if (newImages.length < 2) {
        toast({
          title: "More images needed",
          description: "Please add at least 2 images for better accuracy",
        });
      }
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const processScan = () => {
    if (images.length === 0) {
      toast({
        title: "No images",
        description: "Please add at least one image to scan",
        variant: "destructive",
      });
      return;
    }

    if (images.length < 2) {
      toast({
        title: "Recommendation",
        description: "Adding more images will improve accuracy",
      });
    }

    setIsProcessing(true);
    // Simulate processing delay
    setTimeout(() => {
      setIsProcessing(false);
      scanLabelMutation.mutate(images);
    }, 2000);
  };

  const resetScanner = () => {
    setImages([]);
    setScanResult(null);
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const getImagePreview = (file: File) => {
    return URL.createObjectURL(file);
  };

  const getImageTypeLabel = (index: number) => {
    const labels = ["Nutrition Facts", "Ingredient List", "Product Label"];
    return labels[index] || "Additional";
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          AI Label Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Image Upload Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Upload Images</h4>
            <Badge variant={images.length >= 2 ? "default" : "secondary"}>
              {images.length}/3 images
            </Badge>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload from Gallery
            </Button>
            <Button
              variant="outline"
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1"
            >
              <Camera className="h-4 w-4 mr-2" />
              Take Photo
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* Image Previews */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {images.map((file, index) => (
                <div key={index} className="relative">
                  <img
                    src={getImagePreview(file)}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 h-6 w-6 p-0"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <Badge
                    variant="secondary"
                    className="absolute bottom-2 left-2 text-xs"
                  >
                    {getImageTypeLabel(index)}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Processing Button */}
          <Button
            onClick={processScan}
            disabled={images.length === 0 || isProcessing || scanLabelMutation.isPending}
            className="w-full"
          >
            {isProcessing || scanLabelMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing Images...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Scan Label
              </>
            )}
          </Button>

          {/* Processing Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <Progress value={66} className="w-full" />
              <p className="text-sm text-gray-600 text-center">
                AI is analyzing your supplement labels...
              </p>
            </div>
          )}
        </div>

        {/* Scan Results */}
        {scanResult && (
          <div className="space-y-4 p-4 border rounded-lg bg-green-50">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-green-800">Scan Results</h4>
              <Badge variant="outline" className="text-green-700">
                {scanResult.confidence}% confidence
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <span className="font-medium text-green-800">Supplement:</span>
                <p className="text-sm">{scanResult.supplementName}</p>
              </div>
              <div>
                <span className="font-medium text-green-800">Brand:</span>
                <p className="text-sm">{scanResult.brand}</p>
              </div>
              <div>
                <span className="font-medium text-green-800">Dosage:</span>
                <p className="text-sm">{scanResult.dosageAmount} {scanResult.dosageUnit}</p>
              </div>
              <div>
                <span className="font-medium text-green-800">Serving Size:</span>
                <p className="text-sm">{scanResult.servingSize}</p>
              </div>
              <div>
                <span className="font-medium text-green-800">Key Ingredients:</span>
                <p className="text-sm">{scanResult.ingredients.join(", ")}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => createProtocolFromScan.mutate(scanResult)}
                disabled={createProtocolFromScan.isPending}
                className="flex-1"
              >
                {createProtocolFromScan.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Protocol
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={resetScanner}>
                Scan Another
              </Button>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
          <h5 className="font-medium mb-2">Tips for best results:</h5>
          <ul className="space-y-1 text-xs">
            <li>• Take clear photos of the nutrition facts label</li>
            <li>• Include the ingredient list for accuracy</li>
            <li>• Capture the product name and brand clearly</li>
            <li>• Use good lighting and avoid glare</li>
            <li>• At least 2 images recommended, 3 for optimal results</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}