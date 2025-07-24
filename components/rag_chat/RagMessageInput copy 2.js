import React, { useContext, useRef, useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import { RagChatbotContext } from "@/context/RagChatbotContext";

const RagMessageInput = () => {
  const {
    inputMessage,
    setInputMessage,
    handleQuestionSubmit,
    botResponseLoading,
    handleMagicEnhanceTextBtnClick,
    magicEnhanceLoading,
  } = useContext(RagChatbotContext);

  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!botResponseLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [botResponseLoading]);

  const handleMicClick = async () => {
    if (isRecording) {
      console.log("Stop recording...");
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }
      // Stop all tracks to release microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
    } else {
      console.log("Recording started...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000, // Better for transcription
            channelCount: 1, // Mono audio
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        streamRef.current = stream;

        // Check if MediaRecorder supports webm format
        const options = { mimeType: "audio/webm;codecs=opus" };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          console.warn("webm not supported, falling back to default");
          delete options.mimeType;
        }

        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
          console.log("Data available:", e.data.size);
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          console.log("Recording stopped, chunks:", chunks.length);
          if (chunks.length > 0) {
            const mimeType = mediaRecorder.mimeType || "audio/webm";
            const blob = new Blob(chunks, { type: mimeType });
            console.log("Blob created:", blob.size, "bytes, type:", blob.type);
            await uploadAudio(blob);
          } else {
            console.error("No audio data recorded");
          }
        };

        mediaRecorder.onerror = (e) => {
          console.error("MediaRecorder error:", e.error);
          setIsRecording(false);
        };

        mediaRecorder.start(1000); // Collect data every second
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone access denied:", err);
        alert(
          "Microphone access is required for voice input. Please allow microphone access and try again."
        );
      }
    }
  };

  const uploadAudio = async (blob) => {
    if (blob.size === 0) {
      console.error("Empty audio blob");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();

    // Determine file extension based on blob type
    const fileExtension = blob.type.includes("webm") ? "webm" : "wav";
    formData.append("audio", blob, `voice.${fileExtension}`);

    try {
      console.log("Uploading audio blob:", blob.size, "bytes");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/aws/haiku/upload-audio`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();
      console.log("Upload response:", data);

      if (response.ok && data.transcription) {
        setInputMessage(data.transcription);
        console.log("Transcription received:", data.transcription);
      } else {
        console.error("Upload failed:", data.error || "Unknown error");
        alert("Failed to transcribe audio. Please try again.");
      }
    } catch (error) {
      console.error("Error uploading audio:", error);
      alert(
        "Network error while uploading audio. Please check your connection and try again."
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Cleanup function
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="panel-body msg-type-area">
      <form onSubmit={handleQuestionSubmit}>
        <button
          type="button"
          className="btn btn-icon btn-outline-primary"
          onClick={handleMagicEnhanceTextBtnClick}
          disabled={magicEnhanceLoading || isUploading}
        >
          <i className="fa-light fa-wand-magic-sparkles"></i>
        </button>

        <Form.Control
          ref={inputRef}
          autoComplete="off"
          type="text"
          className="form-control chat-input"
          id="chat-input"
          placeholder="Type your message..."
          value={inputMessage}
          disabled={botResponseLoading || magicEnhanceLoading || isUploading}
          onChange={(e) => setInputMessage(e.target.value)}
          style={{ position: "relative", zIndex: 1 }}
        />

        {(magicEnhanceLoading || isUploading) && (
          <div className="input-overlay">
            <div className="spinner-border text-primary" />
            {isUploading && <small>Processing audio...</small>}
          </div>
        )}

        <button
          type="button"
          className={`btn btn-icon ${
            isRecording ? "btn-danger" : "btn-outline-secondary"
          }`}
          onClick={handleMicClick}
          disabled={botResponseLoading || magicEnhanceLoading || isUploading}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          <i
            className={`fa-light ${isRecording ? "fa-stop" : "fa-microphone"}`}
          ></i>
        </button>

        <button
          type="submit"
          className="btn btn-icon btn-outline-primary"
          disabled={botResponseLoading || magicEnhanceLoading || isUploading}
        >
          <i className="fa-light fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
};

export default RagMessageInput;
