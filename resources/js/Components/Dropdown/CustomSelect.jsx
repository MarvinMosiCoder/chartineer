import React from "react";
import DescIcon from "../Table/Icons/DescIcon";
import FormatLabelName from "../../Utilities/FormatLabelName";
import Select from 'react-select';
import { useTheme } from "../../Context/ThemeContext";

const CustomSelect = ({isMulti = false, maxMenuHeight = "100px", isStatus = false, menuPlacement, isDisabled,  options, onChange, value, name, defaultSelect, displayName, is_multi='', selectType = '', placeholder, extendClass, addMainClass }) => {
    const {theme} = useTheme();
    const customStyles = {
        control: (provided) => ({
            ...provided,
            backgroundColor: "#101215", // Dark background (Tailwind's bg-gray-800)
            borderColor: "#9CA3AF)", // Border color (Tailwind's border-gray-600)
            color: "#fff", // Text color
            boxShadow: "none",
            "&:hover": {
                borderColor: "#9ca3af", // Hover state border color (Tailwind's border-gray-400)
            },
        }),
        singleValue: (provided) => ({
            ...provided,
            color: "#9CA3AF", // Ensure selected value text is white
        }),
        menu: (provided) => ({
            ...provided,
            backgroundColor: "#1f2937", // Dark background for dropdown menu
            color: "#9CA3AF", // Dropdown text color
            maxHeight: maxMenuHeight,
            
        }),
        menuList: (provided) => ({
            ...provided,
            maxHeight: maxMenuHeight, 
            overflowY: "auto", 
        }),
        option: (provided, state) => ({
            ...provided,
            backgroundColor: state.isFocused ? "#374151" : "#1f2937", // Highlight on hover (Tailwind's bg-gray-700)
            color: isStatus ? state.data.status == "INACTIVE" ? "#EB4034" : "#9CA3AF" : "#9CA3AF", // Option text color
            "&:active": {
                backgroundColor: "#4b5563", // Active state background
            },
        }),
    };

    const customStatusStyles = {
        option: (provided, state) => ({
          ...provided,
          color: isStatus ? state.data.status === "INACTIVE" ? "#EB4034" : "" : "", // Make text red for INACTIVE status
        }),
        menu: (provided) => ({
            ...provided,
            maxHeight: maxMenuHeight,
        }),
        menuList: (provided) => ({
            ...provided,
            maxHeight: maxMenuHeight, 
            overflowY: "auto", 
        }),
      };
      
    return (
        <div className={`relative ${addMainClass}`}>
            <label
                htmlFor={name}
                className={`block text-sm font-bold ${theme === 'bg-skin-black' ? ' text-gray-400' : 'text-gray-700'}  font-poppins`}
            >
                {displayName || FormatLabelName(name)}
            </label>
            {selectType 
            ? 
           <Select
                placeholder={placeholder}
                defaultValue={value}
                name={name}
                isMulti={isMulti}
                isDisabled={isDisabled}
                className={`block w-full bg-gray-800 border-gray-300 mt-1  rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm`}
                onChange={onChange}
                menuPlacement={menuPlacement}
                options={options.map(opt => ({ value: opt.value, label: opt.label, name: name, status: opt.status}))}
                styles={theme === 'bg-skin-black' ? customStyles : customStatusStyles}
            />
             
               
            : 
                <select
                    name={name}
                    value={value}
                    onChange={onChange}
                    disabled={isDisabled}
                    className={`appearance-none px-4 pr-7 py-2 text-sm text-left outline-none border border-gray-300 rounded-lg ${theme === 'bg-skin-black' ? theme+' text-gray-300' : 'bg-white'} w-full cursor-pointer hover:border-gray-400 focus:ring-2 focus:ring-teal-500 transition duration-200 truncate ${extendClass}`}
                >
                    <option value="" className="truncate">{defaultSelect}</option>
                    {options.map((option, index) => (
                        <option key={index} value={option.id} className="truncate">
                            {option.name}
                        </option>
                    ))}
                </select>
            }
            {!selectType 
            ? 
                <span className="absolute top-1/2 right-5 -translate-y-1/2  pointer-events-none">
                    <DescIcon />
                </span>
            : ''}
           
        </div>
    );
};

export default CustomSelect;
