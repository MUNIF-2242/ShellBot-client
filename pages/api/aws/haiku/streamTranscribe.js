// pages/api/streamTranscribe.js
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import { PassThrough } from "stream";

const REGION = "us-east-1";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const audioBuffer = Buffer.concat(chunks);

    const client = new TranscribeStreamingClient({ region: REGION });

    const audioStream = new PassThrough();
    audioStream.end(audioBuffer);

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: "en-US",
      MediaEncoding: "pcm", // Recommended: PCM (16-bit signed little endian)
      MediaSampleRateHertz: 16000,
      AudioStream: (async function* () {
        for await (const chunk of audioStream) {
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      })(),
    });

    try {
      const response = await client.send(command);
      let transcriptText = "";

      for await (const event of response.TranscriptResultStream) {
        if (event.TranscriptEvent) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (result.IsPartial === false && result.Alternatives.length > 0) {
              transcriptText += result.Alternatives[0].Transcript + " ";
            }
          }
        }
      }

      return res.status(200).json({ transcription: transcriptText.trim() });
    } catch (err) {
      console.error("Transcribe streaming error:", err);
      return res
        .status(500)
        .json({ error: "Streaming failed: " + err.message });
    }
  });
}
