import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { IncomingForm } from "formidable";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// Disable Next.js built-in body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

const REGION = "us-east-1";
const BUCKET_NAME = "kriyabotbucket";
const OUTPUT_BUCKET = BUCKET_NAME;

const s3 = new S3Client({ region: REGION });
const transcribe = new TranscribeClient({ region: REGION });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    console.log("Starting audio upload and transcription process...");

    const { fields, files } = await parseForm(req);
    console.log("Form parsed successfully");

    // Handle both array and single file formats from formidable
    const file = Array.isArray(files.audio) ? files.audio[0] : files.audio;

    if (!file) {
      console.error("No audio file found in upload");
      return res.status(400).json({ error: "No audio file provided" });
    }

    console.log("Audio file details:", {
      originalFilename: file.originalFilename,
      mimetype: file.mimetype,
      size: file.size,
      filepath: file.filepath,
    });

    // Check file size (AWS Transcribe has limits)
    if (file.size > 500 * 1024 * 1024) {
      // 500MB limit
      return res
        .status(400)
        .json({ error: "Audio file too large (max 500MB)" });
    }

    if (file.size === 0) {
      return res.status(400).json({ error: "Empty audio file" });
    }

    const fileStream = fs.createReadStream(file.filepath);

    // Determine file extension and content type
    let contentType = "audio/webm";
    let fileExtension = "webm";

    if (file.mimetype) {
      contentType = file.mimetype;
      if (file.mimetype.includes("wav")) {
        fileExtension = "wav";
      }
    }

    const key = `uploads/audio-${uuidv4()}.${fileExtension}`;
    console.log("Uploading to S3 with key:", key);

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: fileStream,
          ContentType: contentType,
        })
      );
      console.log("S3 upload successful");
    } catch (err) {
      console.error("S3 upload error:", err);
      return res
        .status(500)
        .json({ error: "Failed to upload to S3: " + err.message });
    }

    // Clean up temp file
    try {
      fs.unlinkSync(file.filepath);
    } catch (cleanupErr) {
      console.warn("Failed to cleanup temp file:", cleanupErr);
    }

    const s3Uri = `s3://${BUCKET_NAME}/${key}`;
    const jobName = `transcribe-${uuidv4()}`;

    console.log("Starting transcription job:", jobName);
    console.log("S3 URI:", s3Uri);

    // Determine media format for AWS Transcribe
    let mediaFormat = "webm";
    if (fileExtension === "wav") {
      mediaFormat = "wav";
    }

    try {
      const transcribeParams = {
        TranscriptionJobName: jobName,
        LanguageCode: "en-US",
        MediaFormat: mediaFormat,
        Media: {
          MediaFileUri: s3Uri,
        },
        OutputBucketName: OUTPUT_BUCKET,
      };

      console.log("Transcribe params:", transcribeParams);

      await transcribe.send(new StartTranscriptionJobCommand(transcribeParams));
      console.log("Transcription job started successfully");
    } catch (err) {
      console.error("Transcribe start error:", err);
      return res.status(500).json({
        error: "Failed to start transcription: " + err.message,
      });
    }

    try {
      let completed = false;
      let transcriptUri = "";
      const maxAttempts = 10; // Increased timeout
      const pollInterval = 2000; // 2 seconds

      console.log("Polling for transcription completion...");

      for (let i = 0; i < maxAttempts; i++) {
        console.log(`Polling attempt ${i + 1}/${maxAttempts}`);

        const result = await transcribe.send(
          new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
        );

        const job = result.TranscriptionJob;
        console.log("Job status:", job.TranscriptionJobStatus);

        if (job.TranscriptionJobStatus === "COMPLETED") {
          transcriptUri = job.Transcript.TranscriptFileUri;
          completed = true;
          console.log("Transcription completed! URI:", transcriptUri);
          break;
        } else if (job.TranscriptionJobStatus === "FAILED") {
          console.error("Transcription failed:", job.FailureReason);
          return res.status(500).json({
            error:
              "Transcription failed: " + (job.FailureReason || "Unknown error"),
          });
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      if (!completed) {
        console.error("Transcription timed out");
        return res.status(500).json({ error: "Transcription timed out" });
      }

      console.log("Fetching transcription result from:", transcriptUri);
      const response = await fetch(transcriptUri);

      if (!response.ok) {
        console.error(
          "Failed to fetch transcription result:",
          response.status,
          response.statusText
        );
        return res
          .status(500)
          .json({ error: "Failed to fetch transcription result" });
      }

      const json = await response.json();
      console.log("Transcription JSON:", json);

      const transcriptText = json.results?.transcripts?.[0]?.transcript || "";
      console.log("Final transcript:", transcriptText);

      if (!transcriptText.trim()) {
        return res.status(200).json({
          transcription: "",
          message: "No speech detected in audio",
        });
      }

      return res.status(200).json({ transcription: transcriptText.trim() });
    } catch (err) {
      console.error("Polling/fetching error:", err);
      return res.status(500).json({
        error: "Failed during transcription processing: " + err.message,
      });
    }
  } catch (err) {
    console.error("Form parsing error:", err);
    return res
      .status(500)
      .json({ error: "File upload failed: " + err.message });
  }
}

// Helper function to promisify form parsing
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({
      maxFileSize: 500 * 1024 * 1024, // 500MB
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error("Form parsing error:", err);
        reject(err);
      } else {
        console.log(
          "Form parsed - Fields:",
          Object.keys(fields),
          "Files:",
          Object.keys(files)
        );
        resolve({ fields, files });
      }
    });
  });
}
