// emailSender.js
const nodemailer = require('nodemailer');

async function sendSyncReport({
  toEmail,
  fromSystem,
  toSystem,
  errors = [],
  successes = [],
  notes = []
}) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'grega@etiam.si', // Workspace email
      pass: 'vfbg yaky jqcx ydxr' // app password
    }
  });

  const mailOptions = {
    from: '"Patrik Automation" <patrik-automation@etiam.si>',
    to: toEmail,
    subject: `Patrik Product Sync Report: ${fromSystem} → ${toSystem}`,
    text: 'Patrik Product Sync Report',
    html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Patrik Product Sync Report</title>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Orbitron:wght@400;700&display=swap" rel="stylesheet">
      <style>
        /* Global styles */
        body, table, td { margin:0; padding:0; font-family:'Montserrat', sans-serif; color:#e0e0e0; }
        body { background-color:#0f0f14; }
        img { display:block; border:0; }
        a { color: inherit; text-decoration: none; }
        h1,h2,h3 { margin:0; padding:0; font-family:'Orbitron', sans-serif; }
        p { margin:0 0 1rem 0; }
        pre { margin:0; }
        
        /* Responsive */
        @media only screen and (max-width: 600px) {
          .container { width: 100% !important; padding: 1rem !important; }
          .card { padding: 1rem !important; }
          h1 { font-size: 1.5rem !important; }
          h2 { font-size: 1.2rem !important; }
          pre { font-size:0.8rem !important; }
        }
      </style>
    </head>
    <body>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f14; padding:2rem 0;">
        <tr>
          <td align="center">
            <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1a1f; border-radius:12px; padding:2rem; max-width:600px; width:100%;">
              
              <!-- Logo -->
              <tr>
                <td align="center" style="padding-bottom:2rem;">
                  <img src="https://imgs.pnvnet.si/img/615/301/75/2/c/www.patrikinternational.com/assets/page_info/0308183001671536508.png" width="120" alt="Patrik Logo">
                </td>
              </tr>

              <!-- Title -->
              <tr>
                <td style="text-align:center; padding-bottom:2rem;">
                  <h1 style="font-size:2rem; color:#00d4ff;">Patrik Product Sync Report</h1>
                  <p style="font-size:1rem;">From <strong>${fromSystem}</strong> → To <strong>${toSystem}</strong></p>
                </td>
              </tr>

              <!-- Errors Card -->
              ${errors.length ? `
              <tr>
                <td class="card" style="background-color:#2a1a1a; border-left:5px solid #ff2a2a; border-radius:10px; padding:1.5rem; margin-bottom:1rem; font-weight:600; color:#ff6b6b;">
                  <h2 style="color:#ff2a2a; margin-bottom:0.5rem;">Errors</h2>
                  <pre style="background:#1e1e28; padding:1rem; border-radius:8px; overflow-x:auto; color:#ff6b6b; font-family:'Courier New', monospace; font-size:0.9rem;">${JSON.stringify(errors, null, 2)}</pre>
                </td>
              </tr>` : ''}

              <!-- Successes Card -->
              ${successes.length ? `
              <tr>
                <td class="card" style="background-color:#1a2a1f; border-left:5px solid #00ff80; border-radius:10px; padding:1.5rem; margin-bottom:1rem; font-weight:600; color:#00ff80;">
                  <h2 style="color:#00ff80; margin-bottom:0.5rem;">Successes</h2>
                  <pre style="background:#1e1e28; padding:1rem; border-radius:8px; overflow-x:auto; color:#00ff80; font-family:'Courier New', monospace; font-size:0.9rem;">${JSON.stringify(successes, null, 2)}</pre>
                </td>
              </tr>` : ''}

              <!-- General Notes Card -->
              ${notes.length ? `
              <tr>
                <td class="card" style="background-color:#222733; border-left:5px solid #00d4ff; border-radius:10px; padding:1.5rem; margin-bottom:1rem; font-weight:500; color:#e0e0e0;">
                  <h2 style="color:#00d4ff; margin-bottom:0.5rem;">General Notes</h2>
                  <pre style="background:#1e1e28; padding:1rem; border-radius:8px; overflow-x:auto; color:#00d4ff; font-family:'Courier New', monospace; font-size:0.9rem;">${JSON.stringify(notes, null, 2)}</pre>
                </td>
              </tr>` : ''}

              <!-- Footer -->
              <tr>
                <td style="padding-top:2rem; text-align:center; font-size:0.85rem; color:#777;">
                  © 2025 Time 4 Action - Automated Report
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `
  };

  let info = await transporter.sendMail(mailOptions);
  console.log('Email sent: ', info.messageId);
}

module.exports = { sendSyncReport };
