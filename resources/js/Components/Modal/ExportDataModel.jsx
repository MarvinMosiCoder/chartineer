import React, { useState } from "react";
import InputComponent from "../Forms/Input";
import Button from "../Table/Buttons/Button";
import { useTheme } from "../../Context/ThemeContext";
import useThemeStyles from "../../Hooks/useThemeStyles";

const ExportDataModal = ({ isOpen, onClose, columns, moduleName, settings, formatLabel, fontColor, onClick, filters }) => {
    const {theme} = useTheme();
    const { primayActiveColor } = useThemeStyles(theme);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const handleSubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const exportData = Object.fromEntries(formData.entries());
        // Add filters to the exportData
        exportData.filters = filters ?? [];
        onClick(exportData);
    };
  return (
    <div
      className={`fixed  inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity z-[80] ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      role="dialog"
      aria-hidden={!isOpen}
    >
      <div className={`${theme === 'bg-skin-black' ? 'bg-black-table-color text-gray-300' : 'bg-white'} rounded-lg shadow-xl lg:w-full lg:max-w-lg`}>
        <div className={`${theme === 'bg-skin-white' ? 'bg-skin-black' : theme} ${fontColor} rounded-tl-lg rounded-tr-lg border-b p-4 flex justify-between items-center`}>
          <h4 className={`text-lg font-semibold`}>
            <i className="fa fa-download"></i> Export Data
          </h4>
          <i
            className="fa fa-times-circle text-white font-extrabold text-md cursor-pointer"
            onClick={onClose}
          ></i>
        </div>
        <form
          method="post"
          className="p-4"
          onSubmit={handleSubmit}
        >
          {/* Add URL parameters dynamically if required */}
          <div className="space-y-4">
            <div>
                <InputComponent
                    type="text"
                    name="filename"
                    value={`Report ${moduleName} - ${new Date().toLocaleDateString()}`}
                />
                <p className="text-sm text-gray-500">Specify the filename for export.</p>
            </div>
            <div>
                <InputComponent
                    type="number"
                    name="limit"
                    value={100}
                    max={100000}
                    min={1}
                />
                <p className="text-sm text-gray-500">
                    Maximum number of records to export.
                </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                File Format
              </label>
              <select
                name="fileformat"
                className={`p-2 text-sm text-left outline-none border border-gray-300 rounded-lg ${theme === 'bg-skin-black' ? theme+' text-gray-400' : 'bg-white'} w-full cursor-pointer hover:border-gray-400 focus:ring-2 focus:ring-teal-500 transition duration-200 truncate`}
              >
                <option value="xls">Microsoft Excel (xls)</option>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
            <div>
              <button
                type="button"
                className="text-sm text-blue-500 hover:underline"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? (
                  <>
                    <i className="fa fa-minus-square-o"></i> Hide Advanced
                  </>
                ) : (
                  <>
                    <i className="fa fa-plus-square-o"></i> Show Advanced
                  </>
                )}
              </button>
              {showAdvanced && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Page Size
                    </label>
                    <select
                      name="page_size"
                      defaultValue={settings.default_paper_size}
                      className={`px-4 pr-7 py-2 text-sm text-left outline-none border border-gray-300 rounded-lg ${theme === 'bg-skin-black' ? theme+' text-gray-400' : 'bg-white'} w-full cursor-pointer hover:border-gray-400 focus:ring-2 focus:ring-teal-500 transition duration-200 truncate`}
                    >
                      {["Letter", "Legal", "Ledger"].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                      {[...Array(9)].map((_, i) => (
                        <option key={`A${i}`} value={`A${i}`}>
                          A{i}
                        </option>
                      ))}
                      {[...Array(11)].map((_, i) => (
                        <option key={`B${i}`} value={`B${i}`}>
                          B{i}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex items-center mt-2">
                      <input
                        type="checkbox"
                        name="default_paper_size"
                        value="1"
                        className="form-checkbox text-indigo-600"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Set as default
                      </span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Page Orientation
                    </label>
                    <select
                      name="page_orientation"
                      className={`px-4 pr-7 py-2 text-sm text-left outline-none border border-gray-300 rounded-lg ${theme === 'bg-skin-black' ? theme+' text-gray-400' : 'bg-white'} w-full cursor-pointer hover:border-gray-400 focus:ring-2 focus:ring-teal-500 transition duration-200 truncate`}
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end space-x-1">
            <button
               type="button"
               onClick={onClose}
               className={`bg-skin-default ${theme === 'bg-skin-black' ? 'text-gray-900' : ''} border-[1px] border-gray-400 overflow-hidden rounded-md font-poppins text-sm px-2 py-2 hover:opacity-80`}           
            >
               <i className="fa fa-times-circle text-gray-800"></i> Close
            </button>
            <Button
              type="button"
              extendClass={(theme === 'bg-skin-white' ? primayActiveColor : theme) +" float-right"}
              fontColor={fontColor}
            >
              <i className="fa fa-paper-plane"></i> Submit
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExportDataModal;
