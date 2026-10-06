/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./resources/**/*.blade.php",
        "./resources/**/*.js",
        "./resources/**/*.jsx",
        "./resources/**/*.vue",
    ],
    theme: {
        extend: {
            colors: {
                meme: {
                    bg: 'var(--meme-bg)', panel: 'var(--meme-panel)', border: 'var(--meme-border)',
                    text: 'var(--meme-text)', dim: 'var(--meme-dim)', accent: 'var(--meme-accent)',
                    danger: 'var(--meme-danger)', 'danger-soft': 'var(--meme-danger-soft)',
                    'palette-amber': '#f59e0b',
                },
                "login-bg-color": "#383838",
                "camera-color": "#342D2D",
                "screen-color": "#E8E8E8",
                "black-screen-color": "#1c1c1c",
                "black-table-color": "#151617",
                "status-success": "#57C769",
                "status-error": "#EF5656",
                secondary: "#797878",
                primary: "#282222",
                stroke: "9f9d9d",
                customTextGray: "#3c8dbc",
                "custom-gray": "#F5F5F5",
                "sidebar-hover-color": "#323232",
                "skin-blue": "#134B70",
                "skin-blue-light": "#508C9B",
                "skin-yellow": "#e08e0b",
                "skin-yellow-light": "#FFB200",
                "skin-green": "#00a65a",
                "skin-green-light": "#508D4E",
                "skin-purple": "#BC5A94",
                "skin-purple-light": "#F075AA",
                "skin-red": "#dd4b39",
                "skin-red-light": "#E72929",
                "skin-black": "#242627",
                "skin-black-hover": '#31363F',
                "skin-black-light": "#31363F",
                "skin-white": "#FFFFFF",
                "skin-white-light": "#e9f3f5",
                "skin-white-hover": '#3c8dbc',
                "skin-default": "#e5e7eb",
                "menus-header-color-green": "#dff0d8",
                "menus-header-color-red": "#f2dede",
                
            },
            backgroundImage: {
                "mobile-gradient":
                    "linear-gradient(to bottom, #060505, #333232)",
                "overview-gradient":
                    "linear-gradient(to bottom, #060505, #787575)",
                "radial-gradient-gray":
                    "radial-gradient(circle, #353131, #191717)",
                "skin-blue": "linear-gradient(to bottom right,rgb(118, 159, 210),rgb(7, 117, 145))",
            },
            fontFamily: {
                "nunito-sans": ["Nunito Sans", "sans-serif"],
                "poppins": ["Poppins", "sans-serif"],
            },
            boxShadow: {
                custom: "0 2px 10px rgba(0, 0, 0, 0.1)",
                menus: 'rgba(50, 50, 93, 0.25) 0px 2px 5px -1px, rgba(0, 0, 0, 0.3) 0px 1px 3px -1px',
                menuchild: 'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px, rgba(27, 31, 35, 0.15) 0px 0px 0px 1px',
                customLight: '0px 2px 8px 0px rgba(99, 99, 99, 0.2)',
            },
            keyframes: {
                slideLeft: {
                  '0%': { transform: 'translateX(0)' },
                  '100%': { transform: 'translateX(-100%)' },
                },
                slideInFromLeft: {
                  '0%': { transform: 'translateX(-100%)' },
                  '100%': { transform: 'translateX(0)' },
                },
                floatY: {
                  '0%, 100%': { transform: 'translateY(0)' },
                  '50%': { transform: 'translateY(-10px)' },
                },
                fadeInUp: {
                  '0%': { opacity: '0', transform: 'translateY(16px)' },
                  '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                shimmer: {
                  '100%': { transform: 'translateX(100%)' },
                },
                candlePulse: {
                  '0%, 100%': { transform: 'scaleY(0.55)', opacity: '0.55' },
                  '50%': { transform: 'scaleY(1)', opacity: '1' },
                },
              },
              animation: {
                slideLeft: 'slideLeft 0.5s ease-in-out',
                slideInFromLeft: 'slideInFromLeft 0.5s ease-in-out',
                floatY: 'floatY 6s ease-in-out infinite',
                fadeInUp: 'fadeInUp 0.7s ease-out both',
                shimmer: 'shimmer 1.6s infinite',
                candlePulse: 'candlePulse 1.4s ease-in-out infinite',
            },
            zIndex: {
                '100': '100',
                '110': '110',
            },
        },
    },
    plugins: [
        require('tailwind-scrollbar'),
    ],
};
