module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: { min800: '800px' },
      colors: {
        matrix: {
          canvas: 'rgb(var(--mx-background-rgb) / <alpha-value>)',
          rail: 'rgb(var(--mx-rail-rgb) / <alpha-value>)',
          panel: 'rgb(var(--mx-panel-rgb) / <alpha-value>)',
          raised: 'rgb(var(--mx-raised-rgb) / <alpha-value>)',
          input: 'rgb(var(--mx-input-rgb) / <alpha-value>)',
          border: 'rgb(var(--mx-border-rgb) / <alpha-value>)',
          control: 'rgb(var(--mx-control-rgb) / <alpha-value>)',
          strong: 'rgb(var(--mx-strong-rgb) / <alpha-value>)',
          text: 'rgb(var(--mx-text-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--mx-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--mx-muted-rgb) / <alpha-value>)',
          accent: 'rgb(var(--mx-accent-rgb) / <alpha-value>)',
          'on-accent': 'rgb(var(--mx-on-accent-rgb) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
