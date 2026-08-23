import React, { useEffect, useState } from 'react'
import { AlignJustify, Braces, Database, Info, Trash, Trash2 } from 'lucide-react';
import Button from '../../../Components/Table/Buttons/Button';
import InputComponent from '../../../Components/Forms/Input';
import CustomSelect from '../../../Components/Dropdown/CustomSelect';
import TextArea from '../../../Components/Forms/TextArea';
import { useTheme } from '../../../Context/ThemeContext';


const ApiGeneratorView = ({page_title, api}) => {
    
const { theme } = useTheme();
const baseUrl = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ":" + window.location.port : "" + "/api/");
const [activeMenu, setActiveMenu] = useState('Configuration');

const previewData = {
    success: true,
    data: [1, 2].map((id, index) =>
        Object.keys(api.fields).reduce((acc, key) => {
          acc[key] =
            key === "id"
              ? id
              : key === "name"
              ? index === 0
                ? "John Doe"
                : "Jane Doe"
              : key.includes("created_at") || key.includes("updated_at")
              ? "2025-01-01 00:00:00"
              : `${key}_description`;
          return acc;
        }, {})
    ),
    message: (api.name ? api.name : "Data") + " retrieved successfully"
};


  return (
    <>
        <div className={`${theme === 'bg-skin-black' ? 'bg-black-table-color text-gray-400' : 'bg-white text-black'} rounded-md shadow-menus`}>
            <div>
                {/* HEADER */}
                <div className='py-2 px-3 border-b select-none flex justify-between items-center'>
                    <div className={`${theme === 'bg-skin-black' ? 'bg-black/30' : 'bg-gray-100'} p-1  w-fit flex space-x-1`}>
                        <button className={`${activeMenu == 'Configuration' ? theme == 'bg-skin-black' ? 'bg-skin-black' : 'bg-white ' : 'hover:bg-black/10 border-transparent'} flex items-center p-2 border  rounded-md outline-none`} onClick={()=>{setActiveMenu('Configuration');}}>
                            <Database className={`w-4 h-4 ${activeMenu == 'Configuration' ? 'text-blue-500' : 'text-gray-500'} mr-2`}/>
                            <p className={`${activeMenu == 'Configuration' ? theme == 'bg-skin-black' ? 'text-white' : 'text-black' : 'text-gray-500'} font-semibold text-[10px] mr-3`}>Configuration</p>
                        </button>
                        <button className={`${activeMenu == 'Parameters' ? theme == 'bg-skin-black' ? 'bg-skin-black' : 'bg-white' : 'hover:bg-black/10 border-transparent'} flex items-center p-2 border  rounded-md outline-none`} onClick={()=>{setActiveMenu('Parameters');}} >
                            <AlignJustify className={`w-4 h-4 ${activeMenu == 'Parameters' ? 'text-blue-500' : 'text-gray-500'} mr-2`}/>
                            <p className={`${activeMenu == 'Parameters' ? theme == 'bg-skin-black' ? 'text-white' : 'text-black' : 'text-gray-500'} font-semibold text-[10px] mr-3`}>Parameters</p>
                        </button>
                        <button className={`${activeMenu == 'Preview' ? theme == 'bg-skin-black' ? 'bg-skin-black' : 'bg-white' : 'hover:bg-black/10 border-transparent'} flex items-center p-2 border  rounded-md outline-none`} onClick={()=>{setActiveMenu('Preview');}}>
                            <Braces className={`w-4 h-4 ${activeMenu == 'Preview' ? 'text-blue-500' : 'text-gray-500'} mr-2`}/>
                            <p className={`${activeMenu == 'Preview' ? theme == 'bg-skin-black' ? 'text-white' : 'text-black' : 'text-gray-500'} font-semibold text-[10px] mr-3`}>Preview</p>
                        </button>
                    </div>
                </div>

                {/* BODY */}
                <div className='px-5 py-5'>
                    {activeMenu === 'Configuration' && 
                        <div>
                            <div className='md:grid md:grid-cols-6 md:gap-3 md:space-y-0 space-y-2'>
                                <div className='md:col-span-2'>
                                    <InputComponent 
                                        displayName='API Name'
                                        name='api_name'
                                        value={api.name}
                                        disabled
                                        placeholder='Enter API Name'
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Human-readable name for your API</p>
                                </div>
                                <div className='md:col-span-2'>
                                    <InputComponent 
                                        displayName='API Endpoint'
                                        name='api_endpoint'
                                        value={api.endpoint}
                                        disabled
                                        placeholder='Enter API Endpoint'
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Endpoint identifier</p>
                                </div>
                                <div className='md:col-span-2'>
                                    <InputComponent 
                                        displayName='Table'
                                        value={api.table_name}
                                        disabled
                                        placeholder='Enter API Endpoint'
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Database table to query</p>
                                </div>
                                <div className='md:col-span-2'>
                                    <InputComponent 
                                        type='text'
                                        displayName='API Slug/EndPoint'
                                        name='api_slug'
                                        value={baseUrl + api.endpoint}
                                        disabled
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Base URL for your API</p>
                                </div>
                                <div className='md:col-span-2 z-20'>
                                    <InputComponent 
                                        displayName='Action Type'
                                        value={api.action_type}
                                        disabled
                                        placeholder='Select Action Type'
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Type of API action</p>
                                </div>
                                <div className='md:col-span-2'>
                                <div>
                                        <label className={`block text-xs font-bold ${theme === 'bg-skin-black' ? ' text-gray-400' : 'text-gray-700'}  font-poppins`}>API Method Type</label>
                                        <div className="relative rounded-lg mt-1 flex space-x-1 overflow-hidden border-2 bg-gray-300 select-none">
                                            <div
                                                className={`absolute ${api.method == 'GET' ? 'bg-green-600' : api.method == 'POST' ? 'bg-yellow-500' : 'bg-red-600'} rounded-md h-full transition-all duration-300`}
                                                style={{
                                                width: "33.33%",
                                                left: api.method === "GET" ? "0%" : api.method === "POST" ? "33.33%" : "66.66%",
                                                }}
                                            ></div>
                                            <div
                                                className={`flex-1 py-2 outline-none text-sm font-medium text-center z-10
                                                ${api.method === "GET" ? "text-white" : "text-black/50"}`}
                                            >
                                                GET
                                            </div>
                                            <div
                                                className={`flex-1 py-2 outline-none text-sm font-medium text-center z-10
                                                ${api.method == "POST" ? "text-white" : "text-black/50"}`}
                                            >
                                                POST
                                            </div>
                                            <div
                                                className={`flex-1 py-2 outline-none text-sm font-medium text-center z-10
                                                ${api.method == "DELETE" ? "text-white" : "text-black/50"}`}
                                            >
                                                DELETE
                                            </div>
                                        </div>
                                        <p className='text-[10px] mt-1 font-medium text-gray-500'>HTTP method for this endpoint</p>
                                </div>
                                </div>
                            
                            </div>
                        </div>
                    }

                    {activeMenu === 'Parameters' && 
                        <>
                            <div>
                                <div className='flex items-center mb-5'>
                                    <p className='text-sm font-bold mr-3'>Parameters</p>
                                    <div className='text-[10px] px-2.5 py-0.5 font-medium rounded-full bg-gray-200'>{Object.entries(api.fields).length} items</div>
                                </div>
                                <div className='hidden md:grid md:grid-cols-12 text-xs md:gap-4 mb-2 font-semibold'>
                                    <p className='text-nowrap md:col-span-2'>Field Name</p>
                                    <p className='text-nowrap md:col-span-2'>Table Relation</p>
                                    <p className='text-nowrap md:col-span-2'>Column Relation</p>
                                    <p className='text-nowrap md:col-span-2'>Display Relation</p>
                                    <p className='text-nowrap md:col-span-2'>Laravel Validations</p>
                                </div>
                                {Object.entries(api.fields).map(([key, value]) => {

                                    const relation = api.relations[value];
                                    const validations = api.rules[value];
                                 
                                    return <div key={key} className='md:grid md:grid-cols-12 md:gap-4 border p-3 pb-4 rounded mb-2'>
                                        {/* Fields Name */}
                                        <div className='md:col-span-2'>
                                            <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Field Name</p>
                                            <InputComponent 
                                                type='text'
                                                disabled
                                                value={value}
                                            />
                                        </div>

                                        {/* Relations */}
                                        <div className='md:col-span-6'>
                                            <div className='md:grid md:grid-cols-3 md:gap-1'>
                                                <div className='md:col-span-1'>
                                                    <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Table Relation</p>
                                                    <InputComponent 
                                                        disabled
                                                        placeholder='Table'
                                                        value={relation?.table ? relation.table : ""}
                                                    />
                                                </div>
                                                <div className='md:col-span-1'>
                                                    <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Column Relation</p>
                                                    <InputComponent
                                                        disabled
                                                        placeholder='Column'
                                                        value={relation?.column ? relation.column : ""}
                                                    />
                                                </div>
                                                <div className='md:col-span-1'>
                                                    <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Display Relation</p>
                                                    <InputComponent 
                                                        disabled
                                                        placeholder='Display Col'
                                                        value={relation?.column_get ? relation.column_get : ""}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Laravel Validations */}
                                        <div className='md:col-span-4 items-center w-full'>
                                            <p className='text-nowrap grid md:hidden text-xs font-semibold mt-2'>Laravel Validations</p>
                                            <div className='flex items-center'>
                                                <InputComponent 
                                                    disabled
                                                    addClass="w-full mr-2"
                                                    value={validations ? validations : ""}
                                                    placeholder="required|string|max:255"
                                                />
                                            </div>
                                        
                                        </div>

                                    </div>
                                    
                                })}
                            </div>
                            <div className='pt-2'>
                                <p className='text-nowrap text-xs font-semibold my-2'>SQL Where Query (Optional)</p>
                                <TextArea 
                                    rows='5'
                                    disabled
                                    value={api.sql_parameter ? api.sql_parameter : ''}
                                    placeholder='Enter Query here... e.g.(id = [paramId])'
                                />
                                <small className='text-[10px]'>
                                    <i className='fa fa-info-circle me-1 text-[12px] text-sky-500'></i>
                                    <b className='text-sky-500 text-[10px]'>NOTE: </b> 
                                        If you have table relations in you Parameters please specify what 
                                        table you were dealing with your SQL Where Query here. 
                                    <b> E.g. (table.column = [value])</b>
                                </small>
                            </div> 
                        </>
                    }

                    {activeMenu === 'Preview' && 
                    (
                        <>
                            <div className='border rounded-lg'>
                            <div className="px-4 py-3 border-b">
                                <p className='text-sm font-semibold'>API Preview</p>
                                <p className='text-[10px] text-gray-400'>Generated endpoint and response format</p>
                            </div>
                            <div className="p-4">
                                <div className="rounded-md bg-gray-900 text-gray-50 p-4 font-mono text-sm overflow-x-auto">
                                <div className={`flex items-center gap-2 mb-2 `}>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${api.method == 'GET' ? 'bg-green-600' : api.method == 'POST' ? 'bg-yellow-500' : 'bg-red-600'}  text-white`}>
                                        {api.method}
                                    </span>
                                    <span className={`${api.method == 'GET' ? 'text-green-400' : api.method == 'POST' ? 'text-yellow-500' : 'text-red-400'}`}>{baseUrl + api.endpoint}</span>
                                </div>
                                <div className="text-gray-400 mb-2">// Response</div>
                                <div className="text-xs whitespace-pre-wrap font-mono">
                                    {JSON.stringify(previewData, null, 2)}
                                </div>
                                </div>
                            </div>
                            </div>
                        </>
                    
                    )
                    }
                    
                </div>

                {/* FOOTER */}

                <div className='p-3 border-t flex justify-end'>
                    <Button
                        extendClass={`${theme}`}
                        fontColor="text-white"
                        type="link"
                        href="/api_generator"
                    >
                        <p className='text-xs'>Back</p>
                    </Button>
                </div>
            </div>
        </div>
   
    </>
    
  )
}

export default ApiGeneratorView