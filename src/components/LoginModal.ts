// =============================================================================
// Memory Board – Login / register modal
//
// Vanilla <dialog> used by apiService 401 interception, bootstrap, and logout.
// Submits through apiService.login() / register() (not raw fetch) so session
// state and the tenant cache stay in sync.
// =============================================================================

export class LoginModal {
  private dialog: HTMLDialogElement | null = null;
  private resolveAuthPromise: ((value: boolean) => void) | null = null;
  private mode: 'login' | 'register' = 'login';

  /** Shows the auth dialog and resolves true when login/register succeeds. */
  public prompt(): Promise<boolean> {
    return new Promise((resolve) => {
      this.ensureDialog();
      this.resolveAuthPromise = resolve;
      this.mode = 'login';
      this.syncMode();

      const dialog = this.dialog!;
      const errorDiv = dialog.querySelector('#authError') as HTMLDivElement;
      const usernameInput = dialog.querySelector('#authUsername') as HTMLInputElement;
      const passwordInput = dialog.querySelector('#authPassword') as HTMLInputElement;
      const honeypot = dialog.querySelector('#authWebsite') as HTMLInputElement;

      errorDiv.classList.add('hidden');
      errorDiv.textContent = '';
      usernameInput.value = '';
      passwordInput.value = '';
      honeypot.value = '';
      dialog.showModal();
      usernameInput.focus();
    });
  }

  private ensureDialog(): void {
    if (this.dialog) return;

    const dialog = document.createElement('dialog');
    dialog.className =
      'fixed inset-0 m-auto p-6 bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full backdrop:bg-black/50';
    dialog.innerHTML = `
      <form method="dialog" id="authForm" class="flex flex-col gap-4 relative" autocomplete="on">
        <div role="tablist" aria-label="Authentication" class="flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            role="tab"
            id="authTabLogin"
            aria-selected="true"
            class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-gray-900"
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            id="authTabRegister"
            aria-selected="false"
            class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900"
          >
            Create Account
          </button>
        </div>
        <h3 id="authTitle" class="text-lg font-bold text-gray-800">Sign in</h3>
        <p id="authHint" class="text-sm text-gray-600">Sign in to sync your memories across devices.</p>
        <input
          type="text"
          name="website"
          id="authWebsite"
          tabindex="-1"
          autocomplete="off"
          style="position: absolute; left: -9999px;"
        />
        <input
          type="text"
          id="authUsername"
          name="username"
          required
          minlength="3"
          maxlength="50"
          pattern="[A-Za-z0-9_]{3,50}"
          placeholder="Username"
          autocomplete="username"
          class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <input
          type="password"
          id="authPassword"
          name="password"
          required
          minlength="8"
          placeholder="Password (8+ characters)"
          autocomplete="current-password"
          class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div id="authError" class="text-xs text-red-500 hidden" role="alert"></div>
        <div class="flex justify-end gap-2 mt-2">
          <button
            type="submit"
            id="authSubmit"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Sign in
          </button>
        </div>
      </form>
    `;

    const form = dialog.querySelector('#authForm') as HTMLFormElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });

    dialog.querySelector('#authTabLogin')?.addEventListener('click', () => {
      this.mode = 'login';
      this.syncMode();
    });
    dialog.querySelector('#authTabRegister')?.addEventListener('click', () => {
      this.mode = 'register';
      this.syncMode();
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

  private syncMode(): void {
    const dialog = this.dialog;
    if (!dialog) return;

    const title = dialog.querySelector('#authTitle') as HTMLElement;
    const hint = dialog.querySelector('#authHint') as HTMLElement;
    const submit = dialog.querySelector('#authSubmit') as HTMLButtonElement;
    const password = dialog.querySelector('#authPassword') as HTMLInputElement;
    const errorDiv = dialog.querySelector('#authError') as HTMLDivElement;
    const loginTab = dialog.querySelector('#authTabLogin') as HTMLButtonElement;
    const registerTab = dialog.querySelector('#authTabRegister') as HTMLButtonElement;

    errorDiv.classList.add('hidden');

    const loginActive = this.mode === 'login';
    loginTab.setAttribute('aria-selected', String(loginActive));
    registerTab.setAttribute('aria-selected', String(!loginActive));
    loginTab.className = loginActive
      ? 'flex-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-gray-900'
      : 'flex-1 px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900';
    registerTab.className = !loginActive
      ? 'flex-1 px-3 py-1.5 text-sm font-medium rounded-md bg-white shadow-sm text-gray-900'
      : 'flex-1 px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900';

    if (this.mode === 'register') {
      title.textContent = 'Create Account';
      hint.textContent = 'Usernames are 3–50 letters, numbers, or underscores. Passwords need at least 8 characters.';
      submit.textContent = 'Create Account';
      password.autocomplete = 'new-password';
    } else {
      title.textContent = 'Sign in';
      hint.textContent = 'Sign in to sync your memories across devices.';
      submit.textContent = 'Sign in';
      password.autocomplete = 'current-password';
    }
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

    const usernameInput = dialog.querySelector('#authUsername') as HTMLInputElement;
    const passwordInput = dialog.querySelector('#authPassword') as HTMLInputElement;
    const honeypot = dialog.querySelector('#authWebsite') as HTMLInputElement;
    const errorDiv = dialog.querySelector('#authError') as HTMLDivElement;
    const showError = (message: string) => {
      errorDiv.textContent = message;
      errorDiv.classList.remove('hidden');
    };

    try {
      // Dynamic import avoids a circular module graph (apiService ↔ LoginModal).
      const { apiService, AuthApiError } = await import('../services/apiService');
      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (this.mode === 'register') {
        await apiService.register({
          username,
          password,
          website: honeypot.value,
        });
      } else {
        await apiService.login({ username, password });
      }

      this.finish(true);
    } catch (err) {
      const { AuthApiError } = await import('../services/apiService');
      if (err instanceof AuthApiError) {
        if (err.status === 401) {
          showError('Invalid username or password.');
          return;
        }
        if (err.status === 409) {
          showError('Username already taken.');
          return;
        }
        showError(err.message);
        return;
      }
      showError('Network error contacting server.');
    }
  }
}

export const loginModal = new LoginModal();
