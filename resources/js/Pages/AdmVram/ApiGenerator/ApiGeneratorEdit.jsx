import React, { useEffect, useState } from 'react'
import { AlignJustify, Braces, Database, Info, Trash, Trash2 } from 'lucide-react';
import Modalv2 from '../../../Components/Modal/Modalv2';
import Button from '../../../Components/Table/Buttons/Button';
import InputComponent from '../../../Components/Forms/Input';
import CustomSelect from '../../../Components/Dropdown/CustomSelect';
import { router, useForm } from '@inertiajs/react';
import { useAnchoredTooltip, AnchoredTooltipPortal } from '../../../Components/Tooltip/AnchoredTooltip';
import TextArea from '../../../Components/Forms/TextArea';
import { useTheme } from '../../../Context/ThemeContext';
import { useToast } from '../../../Context/ToastContext';

// Each row's info icon needs its own useAnchoredTooltip() instance. Since these
// rows live inside a selectedColumns.map() whose length changes (add/remove
// column), the hook can't be called directly in the map callback — that would
// vary the number of hook calls between renders. A small per-row component
// keeps one hook call per component instance, which Rules of Hooks requires.
const ValidationRuleHint = ({ isDark }) => {
    const { anchorRef, pos, show, hide } = useAnchoredTooltip('left');
    return (
        <>
            <div
                ref={anchorRef}
                tabIndex={0}
                className='hover:bg-gray-100 w-fit h-fit hover:text-gray-500 p-2 rounded-full text-gray-500 cursor-pointer'
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
            >
                <Info className='w-4 h-4'/>
            </div>
            <AnchoredTooltipPortal pos={pos} label='Laravel validation rules like required, string, max:255, etc.' isDark={isDark} />
        </>
    );
};

const ApiGeneratorEdit = ({table_columns, page_title, api}) => {

const { theme } = useTheme();
const isDark = theme === 'bg-skin-black';
const { handleToast } = useToast();
const baseUrl = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ":" + window.location.port : "" + "/api/");
const [activeMenu, setActiveMenu] = useState('Configuration');
const [selectedColumns, setSelectedColumns] = useState(Object.entries(api?.fields).map(([key, value]) => (value)));
const [allColumns, setAllColumns] = useState(Object.entries(api?.fields).map(([key, value]) => ( value )));
const [showModal, setShowModal] = useState(false);

const { data, setData, processing, reset, post, errors } = useForm({
    id: api?.id || "",
    api_name: api?.name || "",
    api_endpoint: api?.endpoint || "",
    table: api?.table_name || "",
    action_type: api?.action_type || "",
    api_method:  api?.method || "",
    sql_where: api?.sql_parameter || "",
    fields: api?.fields || {}, 
    fields_relations: api?.relations || {}, 
    fields_validations: api?.rules || {}
});

// FOR ADDING ALL COLUMNS ON LOAD
useEffect(()=>{
    const columns = table_columns.find(table => table.table_name === api?.table_name)?.columns || [];
    setAllColumns(columns);
});

const previewData = {
    success: true,
    data: [1, 2].map((id, index) => 
        Object.keys(data.fields).reduce((acc, key) => {
            acc[key] = key === "id" ? id 
                      : key === "name" ? (index === 0 ? "John Doe" : "Jane Doe") 
                      : (key.includes("created_at") || key.includes("updated_at")) ? "2025-01-01 00:00:00" 
                      : `${key}_description`;
            return acc;
        }, {})
    ),
    
    message: (api.name ? api.name : "Data") + " retrieved successfully"
};


const actionType = [
    {
        label:'LISTING/GET',
        value:'LISTING/GET'
    },
    {
        label:'CREATE/POST',
        value:'CREATE/POST'
    },
    {
        label:'UPDATE',
        value:'UPDATE'
    },
    {
        label:'DELETE',
        value:'DELETE'
    },
];

const handleSelectChange = (selected) => {

    if (selected.value === "CREATE/POST" || selected.value === "UPDATE") {
        setData("api_method","POST");
    } else if (selected.value === "LISTING/GET"){
        setData("api_method","GET");
    } else if (selected.value === "DELETE"){
        setData("api_method","DELETE");
    } else {
        setData("api_method","");
    }

    setData(prev => ({
        ...prev,
        action_type: selected.value
    }));


};

const handleTableChange = (selectedOption) => {
    
    // Get all columns for the selected table
    const columns = table_columns.find(table => table.table_name === selectedOption.value)?.columns || [];
    
    setAllColumns(columns); // Store full column list
    setSelectedColumns(columns); // Initially select all columns

    const fieldsObject = columns.reduce((acc, column) => {
        acc[column] = column;  // Set key-value pair as column name => column name
        return acc;
    }, {});

    setData("fields", fieldsObject);

    setData(prev => ({
        ...prev,
        table: selectedOption.value
    }));
};

const handleRelationTableChange = (selectedOption, name) => {

    setData(prev => ({
        ...prev,
        fields_relations: {
            ...prev.fields_relations,
            [name]: {
                table: selectedOption.value,
                column: null,
                column_get: null
            }
        }
    }));
};

const handleRelationColumnChange = (selectedOption, name) => {
    setData(prev => ({
        ...prev,
        fields_relations: {
            ...prev.fields_relations,
            [name]: {
                ...prev.fields_relations[name],
                column: selectedOption.value
            }
        }
    }));
};

const handleDisplayColumnChange = (selectedOption, name) => {
    setData(prev => ({
        ...prev,
        fields_relations: {
            ...prev.fields_relations,
            [name]: {
                ...prev.fields_relations[name],
                column_get: selectedOption.value
            }
        }
    }));
};

const handleValidationChange = (event, name) => {
    const value = event.target.value;

    setData(prev => {
        const updatedValidations = { ...prev.fields_validations };

        if (value === "") {
            delete updatedValidations[name];
        } else {
            updatedValidations[name] = value;
        }

        return {
            ...prev,
            fields_validations: updatedValidations
        };
    });
};


const handleRemoveColumn = (indexToRemove, name) => {
    setSelectedColumns(prevColumns => {
        if (prevColumns.length > 1) { // Ensure at least one remains
            return prevColumns.filter((_, index) => index !== indexToRemove);
        } else {
            return prevColumns; 
        }
    });

    setData(prevData => {
        const updatedFields = { ...prevData.fields };
        const updatedFieldsRelations = { ...prevData.fields_relations };
        const updatedFieldsValidations = { ...prevData.fields_validations };
    
        delete updatedFields[name];
        delete updatedFieldsRelations[name];
        delete updatedFieldsValidations[name];
    
        return {
            ...prevData,
            fields: updatedFields,
            fields_relations: updatedFieldsRelations,
            fields_validations: updatedFieldsValidations
        };
    });
};

const handleAddColumn = () => {
    const missingColumn = allColumns.find(col => !selectedColumns.includes(col));
    if (missingColumn) {
        setSelectedColumns(prevColumns => [...prevColumns, missingColumn]);

        setData(prevData => ({
            ...prevData,
            fields: {
                ...prevData.fields,
                [missingColumn]: missingColumn 
            }
        }));
    }
};  

const handleSubmit = () => { 

     post('/api_generator/update_api', {
        onSuccess: (data) => {
            const { message, type } = data.props.auth.sessions;
            handleToast(message, type);
            reset();
            onClose();
            setActiveMenu('Configuration');
        },
        onError: (error) => {
        }
    });

}

const handleModalToggle = ()=> {
    setShowModal(!showModal);
};

  return (
    <>
        <div className={`${theme === 'bg-skin-black' ? 'bg-black-table-color' : 'bg-white'} rounded-md shadow-menus`}>
            <div>
                {/* HEADER */}
                <div className='py-2 px-3 border-b select-none flex justify-between items-center'>
                    <div className={`${theme === 'bg-skin-black' ? 'bg-black/30' : 'bg-gray-100'} p-1  w-fit flex space-x-1`}>
                        <button className={`${activeMenu == 'Configuration' ? theme == 'bg-skin-black' ? 'bg-skin-black' : 'bg-white ' : 'hover:bg-black/10 border-transparent'} flex items-center p-2 border  rounded-md outline-none`} onClick={()=>{setActiveMenu('Configuration');}}>
                            <Database className={`w-4 h-4 ${activeMenu == 'Configuration' ? 'text-blue-500' : 'text-gray-500'} mr-2`}/>
                            <p className={`${activeMenu == 'Configuration' ? theme == 'bg-skin-black' ? 'text-white' : 'text-black' : 'text-gray-500'} font-semibold text-[10px] mr-3`}>Configuration</p>
                        </button>
                        <button className={`${activeMenu == 'Parameters' ? theme == 'bg-skin-black' ? 'bg-skin-black' : 'bg-white' : 'hover:bg-black/10 border-transparent'} flex items-center p-2 border  rounded-md outline-none`} onClick={()=>{setActiveMenu('Parameters');}} disabled={!data.table}>
                            <AlignJustify className={`w-4 h-4 ${activeMenu == 'Parameters' ? 'text-blue-500' : 'text-gray-500'} mr-2`}/>
                            <p className={`${activeMenu == 'Parameters' ? theme == 'bg-skin-black' ? 'text-white' : 'text-black' : 'text-gray-500'} font-semibold text-[10px] mr-3`}>Parameters</p>
                        </button>
                        <button className={`${activeMenu == 'Preview' ? theme == 'bg-skin-black' ? 'bg-skin-black' : 'bg-white' : 'hover:bg-black/10 border-transparent'} flex items-center p-2 border  rounded-md outline-none`} onClick={()=>{setActiveMenu('Preview');}} disabled={!data.table}>
                            <Braces className={`w-4 h-4 ${activeMenu == 'Preview' ? 'text-blue-500' : 'text-gray-500'} mr-2`}/>
                            <p className={`${activeMenu == 'Preview' ? theme == 'bg-skin-black' ? 'text-white' : 'text-black' : 'text-gray-500'} font-semibold text-[10px] mr-3`}>Preview</p>
                        </button>
                    </div>

                    {allColumns.some(col => !selectedColumns.includes(col)) && (
                        <button className={`${theme} text-white flex items-center h-fit p-2 rounded-md hover:opacity-70`} onClick={handleAddColumn}>
                            <i className="fa fa-plus text-xs px-[1px] mr-2"></i>
                            <p className='text-xs'>Add Parameter</p>
                        </button>
                    )}
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
                                        onChange={(e)=>{setData("api_name", e.target.value)}}
                                        placeholder='Enter API Name'
                                        onError={errors.api_name}
                                        value={data.api_name}
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Human-readable name for your API</p>
                                </div>
                                <div className='md:col-span-2'>
                                    <InputComponent 
                                        displayName='API Endpoint'
                                        name='api_endpoint'
                                        placeholder='Enter API Endpoint'
                                        onChange={(e)=>{setData("api_endpoint", e.target.value)}}
                                        value={data.api_endpoint}
                                        onError={errors.api_endpoint}
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Endpoint identifier</p>
                                </div>
                                <div className='md:col-span-2'>
                                    <CustomSelect 
                                        onChange={handleTableChange}
                                        options={table_columns.map(table => ({ label : table.table_name, value: table.table_name}))}
                                        displayName='Table'
                                        name='table'
                                        value={data.table ? { label: data.table, value: data.table } : null}
                                        selectType="react-select"
                                        onError={errors.table}
                                        placeholder='Select Table'
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Database table to query</p>
                                </div>
                                <div className='md:col-span-2'>
                                    <InputComponent 
                                        type='text'
                                        displayName='API Slug/EndPoint'
                                        name='api_slug'
                                        value={baseUrl + data.api_endpoint}
                                        disabled
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Base URL for your API</p>
                                </div>
                                <div className='md:col-span-2 z-20'>
                                    <CustomSelect 
                                        options={actionType}
                                        displayName='Action Type'
                                        onChange={handleSelectChange}
                                        name='action_type'
                                        onError={errors.action_type}
                                        menuPlacement="top"
                                        value={data.action_type ? { label: data.action_type, value: data.action_type } : null}
                                        selectType="react-select"
                                        placeholder='Select Action Type'
                                    />
                                    <p className='text-[10px] mt-1 font-medium text-gray-500'>Type of API action</p>
                                </div>
                                <div className='md:col-span-2'>
                                <div>
                                        <label className={`block text-xs font-bold ${theme === 'bg-skin-black' ? ' text-gray-400' : 'text-gray-700'}  font-poppins`}>API Method Type</label>
                                        <div className="relative rounded-lg mt-1 flex space-x-1 overflow-hidden border-2 bg-gray-300 select-none">
                                            <div
                                                className={`absolute ${data.api_method == 'GET' ? 'bg-green-600' : data.api_method == 'POST' ? 'bg-yellow-500' : 'bg-red-600'} rounded-md h-full transition-all duration-300`}
                                                style={{
                                                width: "33.33%",
                                                left: data.api_method === "GET" ? "0%" : data.api_method === "POST" ? "33.33%" : "66.66%",
                                                }}
                                            ></div>
                                            <div
                                                className={`flex-1 py-2 outline-none text-sm font-medium text-center z-10
                                                ${data.api_method === "GET" ? "text-white" : "text-black/50"}`}
                                            >
                                                GET
                                            </div>
                                            <div
                                                className={`flex-1 py-2 outline-none text-sm font-medium text-center z-10
                                                ${data.api_method == "POST" ? "text-white" : "text-black/50"}`}
                                            >
                                                POST
                                            </div>
                                            <div
                                                className={`flex-1 py-2 outline-none text-sm font-medium text-center z-10
                                                ${data.api_method == "DELETE" ? "text-white" : "text-black/50"}`}
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
                                    <div className='text-[10px] px-2.5 py-0.5 font-medium rounded-full bg-gray-200'>{selectedColumns.length} items</div>
                                </div>
                                <div className='hidden md:grid md:grid-cols-12 text-xs md:gap-4 mb-2 font-semibold'>
                                    <p className='text-nowrap md:col-span-2'>Field Name</p>
                                    <p className='text-nowrap md:col-span-2'>Table Relation</p>
                                    <p className='text-nowrap md:col-span-2'>Column Relation</p>
                                    <p className='text-nowrap md:col-span-2'>Display Relation</p>
                                    <p className='text-nowrap md:col-span-2'>Laravel Validations</p>
                                </div>
                                {selectedColumns.map((column, index) => (
                                    <div key={index} className='md:grid md:grid-cols-12 md:gap-4 border p-3 pb-4 rounded mb-2'>
                                        {/* Fields Name */}
                                        <div className='md:col-span-2'>
                                            <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Field Name</p>
                                            <InputComponent 
                                                type='text'
                                                disabled
                                                value={column}
                                            />
                                        </div>

                                        {/* Relations */}
                                        <div className='md:col-span-6'>
                                            <div className='md:grid md:grid-cols-3 md:gap-1'>
                                                <div className='md:col-span-1'>
                                                    <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Table Relation</p>
                                                    <CustomSelect 
                                                        onChange={(selected) => handleRelationTableChange(selected, column)}
                                                        options={table_columns.map(table => ({ label: table.table_name, value: table.table_name }))}
                                                        selectType="react-select"
                                                        placeholder='Table'
                                                        value={data.fields_relations[column]?.table ? { label: data.fields_relations[column]?.table , value: data.fields_relations[column]?.table } : null}
                                                    />
                                                </div>
                                                <div className='md:col-span-1'>
                                                    <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Column Relation</p>
                                                    <CustomSelect 
                                                        key={data.fields_relations[column]?.table}
                                                        onChange={(selected) => handleRelationColumnChange(selected, column)}
                                                        options={(data.fields_relations[column]?.table
                                                            ? table_columns.find(table => table.table_name === data.fields_relations[column]?.table)?.columns
                                                            : []).map(col => ({ label: col, value: col }))}
                                                        selectType="react-select"
                                                        placeholder='Column'
                                                        value={data.fields_relations[column]?.column ? { label: data.fields_relations[column]?.column , value: data.fields_relations[column]?.column } : null}
                                                    />
                                                </div>
                                                <div className='md:col-span-1'>
                                                    <p className='text-nowrap grid md:hidden text-xs font-semibold my-2'>Display Relation</p>
                                                    <CustomSelect 
                                                        key={data.fields_relations[column]?.table}
                                                        onChange={(selected) => handleDisplayColumnChange(selected, column)}
                                                        options={(data.fields_relations[column]?.table
                                                            ? table_columns.find(table => table.table_name === data.fields_relations[column]?.table)?.columns
                                                            : []).map(col => ({ label: col, value: col }))}
                                                        selectType="react-select"
                                                        placeholder='Display Col'
                                                        value={data.fields_relations[column]?.column_get ? { label: data.fields_relations[column]?.column_get , value: data.fields_relations[column]?.column_get } : null}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Laravel Validations */}
                                        <div className='md:col-span-4 items-center w-full'>
                                            <p className='text-nowrap grid md:hidden text-xs font-semibold mt-2'>Laravel Validations</p>
                                            <div className='flex items-center'>
                                                <InputComponent 
                                                    addClass="w-full mr-2"
                                                    type='text'
                                                    id={`validation_${index}`}
                                                    value={data.fields_validations[column] || ""}
                                                    placeholder="required|string|max:255"
                                                    onChange={(event) => handleValidationChange(event, column)}
                                                />
                                                <ValidationRuleHint isDark={isDark} />
                                                <button className='hover:bg-red-100  hover:text-red-500 p-2 rounded-full text-gray-500' onClick={() => handleRemoveColumn(index, column)}>
                                                    <Trash2 className='w-4 h-4 '/>
                                                </button>
                                            </div>
                                        
                                        </div>

                                    </div>
                                ))}
                            </div>
                            <div className='pt-2'>
                                <p className='text-nowrap text-xs font-semibold my-2'>SQL Where Query (Optional)</p>
                                <TextArea 
                                    rows='5'
                                    placeholder='Enter Query here... e.g.(id = [paramId])'
                                    value={data.sql_where}
                                    onChange={(e)=>{setData('sql_where', e.target.value)}}
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
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${data.api_method == 'GET' ? 'bg-green-600' : data.api_method == 'POST' ? 'bg-yellow-500' : 'bg-red-600'}  text-white`}>
                                        {data.api_method}
                                    </span>
                                    <span className={`${data.api_method == 'GET' ? 'text-green-400' : data.api_method == 'POST' ? 'text-yellow-500' : 'text-red-400'}`}>{baseUrl + data.api_endpoint}</span>
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

                <div className='p-3 border-t flex justify-between'>
                    <Button
                        extendClass={`${theme}`}
                        fontColor="text-white"
                        type="link"
                        href="/api_generator"
                    >
                        <p className='text-xs'>Back</p>
                    </Button>
                    <Button
                        extendClass={`${theme}`}
                        fontColor="text-white"
                        type="button"
                        onClick={handleModalToggle}
                    >
                        <i className="fa fa-code-merge text-md px-[1px] mr-2"></i>
                        <p className='text-xs'>Update API</p>
                    </Button>
                </div>
            </div>
        </div>
        <Modalv2
            title="API Update Confirmation"
            content="Are you sure you want to update API?"
            confirmButtonName="Update API"
            confirmButtonColor="bg-green-500"
            isOpen={showModal}
            onConfirm={handleSubmit}
            setIsOpen={handleModalToggle}
        />
    </>
    
  )
}

export default ApiGeneratorEdit