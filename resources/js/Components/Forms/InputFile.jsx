import React from "react";
import FormatLabelName from "../../Utilities/FormatLabelName";
import { useTheme } from "../../Context/ThemeContext";

const InputFile = ({
    type = "file",
    name,
    value,
    onChange,
    displayName,
}) => {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const label = displayName || FormatLabelName(name);

    return (
        <label
            htmlFor={name}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-200 ${isDark ? 'border-[#2a2e39] bg-white/[0.02] hover:border-[#434955] hover:bg-white/[0.04]' : 'border-slate-200 bg-slate-50 hover:border-[#2dd4bf]/40 hover:bg-[#2dd4bf]/[0.03]'}`}
        >
            <i className={`fa fa-upload text-sm ${isDark ? 'text-[#5eead4]' : 'text-[#2dd4bf]'}`}></i>
            <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Upload {label}</span>
            <span className={`text-xs ${isDark ? 'text-[#787b86]' : 'text-slate-500'}`}>Choose an image file</span>
            <input
                id={name}
                type={type}
                value={value}
                name={name}
                onChange={onChange}
                accept="image/*"
                className="hidden"
            />
        </label>
    );
};

export default InputFile;
