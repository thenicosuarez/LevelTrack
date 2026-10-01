import OpenAI from "openai";
import { storage } from "./storage";
import fs from "fs";
import path from "path";

// Created on first use so the server can start without OPENAI_API_KEY;
// only voice-note processing needs it.
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set — voice note processing is disabled");
  }
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

export async function processVoiceNoteAsync(voiceNoteId: number, userId: number, audioData: string) {
  try {
    const openai = getOpenAI();

    // Update status to processing
    await storage.updateVoiceNote(voiceNoteId, { processingStatus: "processing" });

    // Extract base64 audio data
    const base64Audio = audioData.split(",")[1];
    const audioBuffer = Buffer.from(base64Audio, "base64");

    // Create a temporary file for OpenAI API using fs
    const tempFilePath = path.join('/tmp', `audio_${voiceNoteId}.wav`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Step 1: Transcribe the audio
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    // Step 2: Analyze the transcription and extract supplement protocol
    const analysisPrompt = `
    Analyze the following transcription of a supplement protocol and extract detailed information:

    Transcription: "${transcription.text}"

    Please provide a JSON response with the following structure:
    {
      "protocols": [
        {
          "name": "Protocol Name",
          "category": "supplements",
          "description": "Brief description",
          "items": [
            {
              "name": "Supplement Name",
              "dosageAmount": 500,
              "dosageUnit": "mg",
              "formFactor": "capsule",
              "timing": "08:00",
              "frequency": "daily",
              "cyclingType": "continuous",
              "currentCyclePhase": "on-cycle",
              "instructions": "Take with food"
            }
          ]
        }
      ],
      "recommendations": [
        "Personalized recommendations based on the protocol",
        "Suggestions for optimization",
        "Potential interactions or considerations"
      ],
      "analysis": "Overall analysis of the protocol effectiveness and suggestions"
    }

    Form factors can be: capsule, tablet, powder, liquid, dropper, sublingual, injectable, topical, gummy, spray
    Cycling types can be: continuous, standard, micro, extended, intensive, custom
    Dosage units can be: mg, g, mcg, ml, oz, capsules, tablets, drops, etc.
    `;

    const analysis = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are a supplement protocol expert. Analyze voice notes and extract structured protocol information. Always respond with valid JSON.",
        },
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const aiAnalysis = JSON.parse(analysis.choices[0].message.content || "{}");

    // Step 3: Update the voice note with results
    await storage.updateVoiceNote(voiceNoteId, {
      transcription: transcription.text,
      aiAnalysis: aiAnalysis,
      extractedProtocols: aiAnalysis.protocols || [],
      processingStatus: "completed",
      processedAt: new Date(),
    });

    // Step 4: Create protocols automatically if requested
    if (aiAnalysis.protocols && aiAnalysis.protocols.length > 0) {
      for (const protocolData of aiAnalysis.protocols) {
        try {
          const protocol = await storage.createProtocol({
            name: protocolData.name,
            description: protocolData.description,
            category: protocolData.category,
            userId,
            isActive: true,
            color: "#14B8A6",
            goals: [],
          });

          // Create protocol items
          if (protocolData.items && protocol.id) {
            for (const item of protocolData.items) {
              await storage.createProtocolItem({
                protocolId: protocol.id,
                name: item.name,
                dosageAmount: item.dosageAmount || null,
                dosageUnit: item.dosageUnit || null,
                formFactor: item.formFactor || null,
                timing: item.timing || null,
                frequency: item.frequency || "daily",
                cyclingType: item.cyclingType || "continuous",
                currentCyclePhase: item.currentCyclePhase || "on-cycle",
                instructions: item.instructions || null,
                onCycleDays: null,
                offCycleDays: null,
                cycleStartDate: null,
                cycleEndDate: null,
                trackingKpis: [],
                startTime: null,
                endTime: null,
                fastingType: null,
                sets: null,
                reps: null,
                duration: null,
                restTime: null,
                weight: null,
                order: 0,
              });
            }
          }
        } catch (error) {
          console.error("Error creating protocol from AI analysis:", error);
        }
      }
    }

    console.log("Voice note processed successfully:", voiceNoteId);
  } catch (error) {
    console.error("Error processing voice note:", error);
    await storage.updateVoiceNote(voiceNoteId, {
      processingStatus: "failed",
      processedAt: new Date(),
    });
  }
}