import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Play, Pause, Loader2, Sparkles, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { VoiceNote } from "@shared/schema";

interface VoiceNoteProcessorProps {
  onProtocolCreated?: () => void;
}

export default function VoiceNoteProcessor({ onProtocolCreated }: VoiceNoteProcessorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVoiceNote, setCurrentVoiceNote] = useState<VoiceNote | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const createVoiceNoteMutation = useMutation({
    mutationFn: async (audioData: Blob) => {
      // Convert audio blob to base64 for API transmission
      const base64Audio = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(audioData);
      });

      const response = await apiRequest("/api/voice-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audioData: base64Audio,
          userId: 1,
        }),
      });
      return response;
    },
    onSuccess: (voiceNote: VoiceNote) => {
      setCurrentVoiceNote(voiceNote);
      toast({
        title: "Voice note uploaded",
        description: "AI is now processing your protocol...",
      });
      // Start polling for processing status
      pollProcessingStatus(voiceNote.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload voice note",
        variant: "destructive",
      });
    },
  });

  const pollProcessingStatus = (voiceNoteId: number) => {
    const interval = setInterval(async () => {
      try {
        const voiceNote = await apiRequest(`/api/voice-notes/${voiceNoteId}`, {
          method: "GET",
        });
        
        if (voiceNote.processingStatus === "completed") {
          clearInterval(interval);
          setCurrentVoiceNote(voiceNote);
          toast({
            title: "Processing complete",
            description: "Your protocol has been analyzed and recommendations are ready!",
          });
          queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
          onProtocolCreated?.();
        } else if (voiceNote.processingStatus === "failed") {
          clearInterval(interval);
          toast({
            title: "Processing failed",
            description: "There was an error processing your voice note",
            variant: "destructive",
          });
        }
      } catch (error) {
        clearInterval(interval);
        console.error("Error polling status:", error);
      }
    }, 2000);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playAudio = () => {
    if (audioBlob) {
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audioRef.current = audio;
      audio.play();
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
    }
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const processVoiceNote = () => {
    if (audioBlob) {
      createVoiceNoteMutation.mutate(audioBlob);
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setCurrentVoiceNote(null);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const getStatusIcon = () => {
    if (!currentVoiceNote) return null;
    
    switch (currentVoiceNote.processingStatus) {
      case "pending":
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <CheckCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Voice Protocol Creator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Recording Controls */}
        <div className="flex flex-col items-center space-y-4">
          {!audioBlob && !isRecording && (
            <Button
              onClick={startRecording}
              size="lg"
              className="w-32 h-32 rounded-full bg-primary hover:bg-primary/90"
            >
              <Mic className="h-8 w-8" />
            </Button>
          )}
          
          {isRecording && (
            <Button
              onClick={stopRecording}
              size="lg"
              className="w-32 h-32 rounded-full bg-red-500 hover:bg-red-600 animate-pulse"
            >
              <Square className="h-8 w-8" />
            </Button>
          )}
          
          <p className="text-sm text-gray-600 text-center">
            {isRecording 
              ? "Recording... Describe your current supplement protocol, dosages, and timing"
              : !audioBlob
              ? "Tap to record your supplement protocol"
              : "Recording complete"}
          </p>
        </div>

        {/* Audio Playback */}
        {audioBlob && !currentVoiceNote && (
          <div className="flex items-center justify-center space-x-4">
            <Button
              onClick={isPlaying ? pauseAudio : playAudio}
              variant="outline"
              size="sm"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button
              onClick={processVoiceNote}
              disabled={createVoiceNoteMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {createVoiceNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Process with AI
                </>
              )}
            </Button>
            <Button onClick={resetRecording} variant="outline" size="sm">
              Start Over
            </Button>
          </div>
        )}

        {/* Processing Status */}
        {currentVoiceNote && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <span className="font-medium">Processing Status</span>
              </div>
              <Badge variant={currentVoiceNote.processingStatus === "completed" ? "default" : "secondary"}>
                {currentVoiceNote.processingStatus}
              </Badge>
            </div>

            {currentVoiceNote.transcription && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Transcription:</h4>
                <p className="text-sm text-gray-700">{currentVoiceNote.transcription}</p>
              </div>
            )}

            {currentVoiceNote.aiAnalysis && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium mb-2">AI Analysis:</h4>
                <div className="text-sm text-gray-700">
                  {typeof currentVoiceNote.aiAnalysis === 'string' 
                    ? currentVoiceNote.aiAnalysis 
                    : JSON.stringify(currentVoiceNote.aiAnalysis, null, 2)}
                </div>
              </div>
            )}

            {currentVoiceNote.processingStatus === "completed" && (
              <div className="flex justify-center">
                <Button onClick={resetRecording} className="bg-primary hover:bg-primary/90">
                  Create Another Protocol
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}