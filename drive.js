// drive.js
const fs = require("fs");
const { google } = require("googleapis");

// Load credentials from JSON key (Service Account)
const KEYFILEPATH = process.env.GCLOUD_SERVICE_ACCOUNT || "service-account.json";
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

async function uploadFile() {
  try {
    // Auth
    const auth = new google.auth.GoogleAuth({
      keyFile: KEYFILEPATH,
      scopes: SCOPES,
    });

    const drive = google.drive({ version: "v3", auth });

    // Change this to your file and folder
    const filePath = "example.txt";
    const folderId = "19QvtMgzcvCrB51GTK6xwne56Z3YQ49Hz";

    const fileMetadata = {
      name: "example.txt",
      parents: [folderId],
    };

    const media = {
      mimeType: "text/plain",
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id",
    });

    console.log("File uploaded, ID:", response.data.id);
  } catch (err) {
    console.error("Error uploading file:", err);
  }
}

uploadFile();
