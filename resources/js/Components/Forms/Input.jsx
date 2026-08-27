import React from "react";
import FormatLabelName from "../../Utilities/FormatLabelName";
import { useTheme } from "../../Context/ThemeContext";

const InputComponent = ({
    type = "text",
    name,
    value,
    onChange,
    placeholder,
    displayName,
    checked,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    return (
        <div>
            <label
                htmlFor={name}
                className={`block text-xs font-semibold ${isDark ? 'text-[#b2b5be]' : 'text-slate-600'} font-poppins`}
            >
                {displayName || FormatLabelName(name)}
            </label>
            <input
                id={name}
                type={type}
                value={value}
                name={name}
                onChange={onChange}
                placeholder={placeholder}
                className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]/30 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14] text-[#d1d4dc] placeholder:text-[#5b6070] focus:border-[#2dd4bf]' : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-[#2dd4bf]'}`}
                checked={checked}
            />
        </div>
    );
};

export default InputComponent;
