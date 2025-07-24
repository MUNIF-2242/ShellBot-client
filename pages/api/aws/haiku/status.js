// /api/transcription/status.js
import {
  TranscribeClient,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";

const REGION = "us-east-1";
const transcribe = new TranscribeClient({ region: REGION });

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Only GET allowed" });
  }

  const { jobName } = req.query;

  if (!jobName) {
    return res.status(400).json({ error: "jobName parameter required" });
  }

  try {
    const result = await transcribe.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );

    const job = result.TranscriptionJob;

    if (job.TranscriptionJobStatus === "COMPLETED") {
      // Fetch the transcription result
      const transcriptUri = job.Transcript.TranscriptFileUri;
      const response = await fetch(transcriptUri);

      if (!response.ok) {
        return res.status(500).json({
          error: "Failed to fetch transcription result",
          status: "error",
        });
      }

      const json = await response.json();
      const transcriptText = json.results?.transcripts?.[0]?.transcript || "";

      return res.status(200).json({
        status: "completed",
        transcription: transcriptText.trim(),
        jobName: jobName,
      });
    } else if (job.TranscriptionJobStatus === "FAILED") {
      return res.status(500).json({
        status: "failed",
        error: job.FailureReason || "Transcription failed",
        jobName: jobName,
      });
    } else if (job.TranscriptionJobStatus === "IN_PROGRESS") {
      return res.status(200).json({
        status: "processing",
        message: "Transcription in progress",
        jobName: jobName,
        progress: Math.min(
          90,
          ((Date.now() - new Date(job.CreationTime).getTime()) / 1000 / 60) * 30
        ), // Rough estimate
      });
    } else {
      return res.status(200).json({
        status: "queued",
        message: "Transcription job queued",
        jobName: jobName,
      });
    }
  } catch (err) {
    console.error("Status check error:", err);
    return res.status(500).json({
      error: "Failed to check transcription status: " + err.message,
      status: "error",
    });
  }
}
