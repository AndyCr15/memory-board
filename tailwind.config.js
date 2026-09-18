/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  // Safelist dynamic color-theme classes used via template literals so Tailwind
  // does not purge them from the production build.
  safelist: [
    // Pastel Pink (rose)
    'bg-rose-50', 'border-rose-200', 'hover:border-rose-300', 'bg-rose-100', 'bg-rose-400', 'ring-rose-300',
    // Pastel Blue (sky)
    'bg-sky-50', 'border-sky-200', 'hover:border-sky-300', 'bg-sky-100', 'bg-sky-400', 'ring-sky-300',
    // Pastel Green (emerald)
    'bg-emerald-50', 'border-emerald-200', 'hover:border-emerald-300', 'bg-emerald-100', 'bg-emerald-400', 'ring-emerald-300',
    // Pastel Yellow
    'bg-yellow-50', 'border-yellow-200', 'hover:border-yellow-300', 'bg-yellow-100', 'bg-yellow-400', 'ring-yellow-300',
    // Pastel Purple
    'bg-purple-50', 'border-purple-200', 'hover:border-purple-300', 'bg-purple-100', 'bg-purple-400', 'ring-purple-300',
    // Pastel Peach (orange)
    'bg-orange-50', 'border-orange-200', 'hover:border-orange-300', 'bg-orange-100', 'bg-orange-400', 'ring-orange-300',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
