(function () {
  "use strict";

  const DEFAULT_API_URL = "http://127.0.0.1:8000";

  class BankStatementWidget {
    constructor(options = {}) {
      this.apiKey = options.apiKey || "";
      this.apiUrl = options.apiUrl || DEFAULT_API_URL;
      this.primaryColor = options.primaryColor || "#2563eb";
      this.theme = options.theme || "dark";
      this.lenderName = options.lenderName || "Partner Lender";
      this.onSuccess = options.onSuccess || function () {};
      this.onError = options.onError || function () {};
      this.onClose = options.onClose || function () {};

      this._modal = null;
      this._pollInterval = null;
    }

    open() {
      if (this._modal) return;
      this._createModal();
    }

    close() {
      if (this._pollInterval) clearInterval(this._pollInterval);
      if (this._modal && this._modal.parentNode) {
        this._modal.parentNode.removeChild(this._modal);
      }
      this._modal = null;
      this.onClose();
    }

    _createModal() {
      const overlay = document.createElement("div");
      overlay.id = "bank-statement-widget-overlay";
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
      overlay.style.backgroundColor = "rgba(10, 15, 29, 0.85)";
      overlay.style.backdropFilter = "blur(8px)";
      overlay.style.zIndex = "999999";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

      const card = document.createElement("div");
      card.style.backgroundColor = this.theme === "dark" ? "#0f172a" : "#ffffff";
      card.style.color = this.theme === "dark" ? "#f8fafc" : "#0f172a";
      card.style.border = this.theme === "dark" ? "1px solid #1e293b" : "1px solid #e2e8f0";
      card.style.borderRadius = "16px";
      card.style.width = "90%";
      card.style.maxWidth = "460px";
      card.style.padding = "28px";
      card.style.boxShadow = "0 25px 50px -12px rgba(0, 0, 0, 0.5)";
      card.style.position = "relative";

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
          <div>
            <h3 style="margin:0; font-size:18px; font-weight:700;">Upload Bank Statement</h3>
            <p style="margin:4px 0 0 0; font-size:12px; color:#94a3b8;">Powered by Credova for ${this.lenderName}</p>
          </div>
          <button id="bsw-close-btn" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer; padding:4px;">&times;</button>
        </div>

        <div id="bsw-dropzone" style="border:2px dashed ${this.primaryColor}55; border-radius:12px; padding:24px 16px; text-align:center; background:${this.primaryColor}0a; cursor:pointer; margin-bottom:16px;">
          <input type="file" id="bsw-file-input" accept=".pdf,image/*" style="display:none;" />
          <div id="bsw-file-label">
            <span style="font-size:28px;">📄</span>
            <p style="margin:8px 0 0 0; font-size:14px; font-weight:600;">Click or drag PDF statement here</p>
            <p style="margin:4px 0 0 0; font-size:11px; color:#94a3b8;">Supports Nigeria 🇳🇬, Ghana 🇬🇭 & Kenya 🇰🇪 (M-PESA)</p>
          </div>
        </div>

        <div style="margin-bottom:18px;">
          <input type="password" id="bsw-password-input" placeholder="PDF Password (leave blank if none)" style="width:100%; box-sizing:border-box; padding:10px 14px; border-radius:8px; border:1px solid #334155; background:#1e293b; color:#fff; font-size:13px; outline:none;" />
        </div>

        <button id="bsw-submit-btn" style="width:100%; padding:12px; border-radius:8px; border:none; background:${this.primaryColor}; color:#fff; font-size:14px; font-weight:600; cursor:pointer; transition:opacity 0.2s;">
          Verify & Submit Statement
        </button>

        <div id="bsw-status-msg" style="margin-top:14px; font-size:12px; text-align:center; display:none;"></div>
      `;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      this._modal = overlay;

      const fileInput = card.querySelector("#bsw-file-input");
      const dropzone = card.querySelector("#bsw-dropzone");
      const fileLabel = card.querySelector("#bsw-file-label");
      const submitBtn = card.querySelector("#bsw-submit-btn");
      const closeBtn = card.querySelector("#bsw-close-btn");
      const passwordInput = card.querySelector("#bsw-password-input");
      const statusMsg = card.querySelector("#bsw-status-msg");

      closeBtn.onclick = () => this.close();
      dropzone.onclick = () => fileInput.click();

      let selectedFile = null;
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          selectedFile = e.target.files[0];
          fileLabel.innerHTML = `<span style="font-size:24px;">✓</span><p style="margin:6px 0 0 0; font-size:13px; font-weight:600; color:#38bdf8;">${selectedFile.name}</p>`;
        }
      };

      submitBtn.onclick = async () => {
        if (!selectedFile) {
          statusMsg.style.display = "block";
          statusMsg.style.color = "#f43f5e";
          statusMsg.innerText = "Please select a bank statement file first.";
          return;
        }

        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.6";
        submitBtn.innerText = "Encrypting & Analyzing...";
        statusMsg.style.display = "block";
        statusMsg.style.color = "#38bdf8";
        statusMsg.innerText = "Verifying document authenticity and running risk engine...";

        const formData = new FormData();
        formData.append("file", selectedFile);
        if (passwordInput.value) {
          formData.append("password", passwordInput.value);
        }

        try {
          const res = await fetch(`${this.apiUrl}/statements/upload`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Upload failed");
          const data = await res.json();
          this._pollJob(data.job_id, statusMsg, submitBtn);
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = "1";
          submitBtn.innerText = "Retry Submission";
          statusMsg.style.color = "#f43f5e";
          statusMsg.innerText = "Upload failed. Please check network connection.";
          this.onError(err);
        }
      };
    }

    _pollJob(jobId, statusMsg, submitBtn) {
      this._pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`${this.apiUrl}/statements/${jobId}`);
          const data = await res.json();

          if (data.status === "completed") {
            clearInterval(this._pollInterval);
            statusMsg.style.color = "#34d399";
            statusMsg.innerText = "Statement successfully verified and analyzed!";
            setTimeout(() => {
              this.onSuccess(data);
              this.close();
            }, 1200);
          } else if (data.status === "failed") {
            clearInterval(this._pollInterval);
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
            submitBtn.innerText = "Retry Submission";
            statusMsg.style.color = "#f43f5e";
            statusMsg.innerText = data.error || "Statement processing failed.";
            this.onError(new Error(data.error));
          }
        } catch (err) {
          clearInterval(this._pollInterval);
          this.onError(err);
        }
      }, 1500);
    }
  }

  // Expose to window global scope
  window.BankStatementWidget = BankStatementWidget;
  window.CredovaWidget = BankStatementWidget;
})();
