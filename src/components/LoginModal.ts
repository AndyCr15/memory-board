// =============================================================================
// Memory Board – Login modal (vanilla, used by apiService 401 interception)
//
// Instantiated as a singleton.  The <dialog> is created lazily on first
// prompt() so importing this module in Vitest does not require a document
// body or immediately mutate the DOM.
// =============================================================================

export class LoginModal {
  private dialog: HTMLDialogElement | null = null;
  private resolveAuthPromise: ((value: boolean) => void) | null = null;

  /** Shows the password dialog and resolves true when login succeeds. */
  public prompt(): Promise<boolean> {
    return new Promise((resolve) => {
      this.ensureDialog();
      this.resolveAuthPromise = resolve;

      const dialog = this.dialog!;
      const errorDiv = dialog.querySelector('#authError') as HTMLDivElement;
      const passwordInput = dialog.querySelector('#authPassword') as HTMLInputElement;

      errorDiv.classList.add('hidden');
      errorDiv.textContent = 'Incorrect password. Please try again.';
      passwordInput.value = '';
      dialog.showModal();
      passwordInput.focus();
    });
  }

  private ensureDialog(): void {
    if (this.dialog) return;

    const dialog = document.createElement('dialog');
    dialog.className =
      'fixed inset-0 m-auto p-6 bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full backdrop:bg-black/50';
    dialog.innerHTML = `
      <form method="dialog" id="authForm" class="flex flex-col gap-4">
        <h3 class="text-lg font-bold text-gray-800">Authentication Required</h3>
        <p class="text-sm text-gray-600">Enter master password to access and sync your memories.</p>
        <input
          type="password"
          id="authPassword"
          required
          placeholder="Password"
          class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div id="authError" class="text-xs text-red-500 hidden">Incorrect password. Please try again.</div>
        <div class="flex justify-end gap-2 mt-2">
          <button
            type="submit"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Unlock
          </button>
        </div>
      </form>
    `;

    const form = dialog.querySelector('#authForm') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });

    dialog.addEventListener('close', () => {
      if (this.resolveAuthPromise) {
        this.resolveAuthPromise(false);
        this.resolveAuthPromise = null;
      }
    });

    document.body.appendChild(dialog);
    this.dialog = dialog;
  }

  private finish(success: boolean): void {
    const resolve = this.resolveAuthPromise;
    this.resolveAuthPromise = null;
    this.dialog?.close();
    resolve?.(success);
  }

  private async handleSubmit(): Promise<void> {
    const dialog = this.dialog;
    if (!dialog) return;

    const passwordInput = dialog.querySelector('#authPassword') as HTMLInputElement;
    const errorDiv = dialog.querySelector('#authError') as HTMLDivElement;

    try {
      const response = await fetch('/api/auth.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value }),
      });

      if (response.ok) {
        this.finish(true);
      } else {
        errorDiv.textContent = 'Incorrect password. Please try again.';
        errorDiv.classList.remove('hidden');
      }
    } catch {
      errorDiv.textContent = 'Network error contacting server.';
      errorDiv.classList.remove('hidden');
    }
  }
}

export const loginModal = new LoginModal();
