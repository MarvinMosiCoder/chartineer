import React, { useState } from 'react'
import { Head, router } from '@inertiajs/react'
import InputComponent from '../../Components/Forms/Input'
import Card from '../../Components/Forms/Card'
import axios from 'axios';
import { useToast } from '../../Context/ToastContext';
import { useTheme } from '../../Context/ThemeContext';
import InputFile from '../../Components/Forms/InputFile';

const ExistingFileRow = ({ label, file, onDelete, isDark }) => (
    <div className="mb-3 w-full">
        <span className={`block text-xs font-semibold ${isDark ? 'text-[#b2b5be]' : 'text-slate-600'} font-poppins`}>{label}</span>
        <div className={`mt-1.5 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${isDark ? 'border-[#2a2e39] bg-[#0b0e14]' : 'border-slate-200 bg-slate-50'}`}>
            <a href={file.content} download={file.content} className="flex items-center gap-2 text-xs font-semibold text-[#2dd4bf] hover:underline">
                <i className="fa fa-download"></i> Download the file
            </a>
            <button
                type="button"
                onClick={(e) => onDelete(e, file.id)}
                className="rounded-md p-1.5 text-red-500 transition-colors duration-200 hover:bg-red-500/10"
                aria-label={`Remove ${label}`}
            >
                <i className="fa fa-trash text-xs"></i>
            </button>
        </div>
    </div>
);

const Settings = ({app_name, favicon, logo, login_background_color, login_font_color, login_background_image}) => {

    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const { handleToast } = useToast();
    const [loading, setLoading] = useState(false);

    const [forms, setForms] = useState({
        app_name: app_name || '',
        favicon: '',
        login_background_color: login_background_color || '',
        login_font_color: login_font_color || ''
    });

    const handleChange = (e) => {
        const key = e.target.name;
        const value =  e.target.files?.[0] ?? e.target.value;
        setForms((forms) => ({
            ...forms,
            [key]: value,
        }));
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post('/settings/postSave', forms, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            if (response.data.type == 'success') {
                handleToast(response.data.message, response.data.status);
                router.reload({ only: ['settings'] });
            } else {
                handleToast(response.data.message, response.data.status);
            }
        } catch (error) {
            if (error.response && error.response.status === 422) {
                handleToast(error.response.data.errors, 'error');
            } else {
                handleToast('An error occurred. Please try again.', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e,id) => {
        e.preventDefault();
        try {
            const response = await axios.post('/settings/postDelete', {id: id});
            if (response.data.type == 'success') {
                handleToast(response.data.message, response.data.status);
                router.reload({ only: ['settings'] });
            } else {
                handleToast(response.data.message, response.data.status);
            }
        } catch (error) {
            if (error.response && error.response.status === 422) {
                handleToast(error.response.data.errors, 'error');
            } else {
                handleToast('An error occurred. Please try again.', 'error');
            }
        }
    }

    return (
        <>
            <Head title='Settings'/>
            <div className={`mb-4 flex flex-col gap-4 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-[#2a2e39] bg-[#131722]' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${isDark ? 'bg-white/5 text-[#5eead4]' : 'bg-[#2dd4bf]/10 text-[#2dd4bf]'}`}>
                        <i className="fa fa-cog"></i>
                    </span>
                    <div>
                        <p className={`text-[10px] font-bold uppercase tracking-[.14em] ${isDark ? 'text-[#787b86]' : 'text-slate-400'}`}>System configuration</p>
                        <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>App Settings</h1>
                        <p className={`mt-1 text-xs ${isDark ? 'text-[#9598a1]' : 'text-slate-500'}`}>Manage the application identity, login styling, and public image assets used across the admin experience.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white transition-colors duration-200 hover:bg-[#14b8a6] disabled:opacity-50"
                >
                    <i className="fa fa-save"></i> {loading ? "Saving..." : "Save Settings"}
                </button>
            </div>
            <div className="flex gap-4 flex-col sm:flex-row">
                <Card headerName="Application Settings" description="Control the app name, browser favicon, and navigation logo." marginBottom={4} iconClass="fa fa-cog" >
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3 w-full">
                            <InputComponent
                                name="app_name"
                                value={forms.app_name}
                                onChange={handleChange}
                                displayName="Application Name"
                            />
                        </div>
                        {favicon?.content
                        ?
                            <ExistingFileRow label="Favicon" file={favicon} onDelete={handleDelete} isDark={isDark} />
                        :
                            <div className="mb-3 w-full">
                                <InputFile name="favicon" onChange={handleChange} displayName="Favicon" />
                            </div>
                        }
                        {logo?.content
                        ?
                            <ExistingFileRow label="Logo" file={logo} onDelete={handleDelete} isDark={isDark} />
                        :
                            <div className="mb-3 w-full">
                                <InputFile name="system_logo" onChange={handleChange} displayName="Logo" />
                            </div>
                        }
                    </form>
                </Card>
                <Card headerName="Login Settings" description="Customize login screen colors and background image." marginBottom={4} iconClass="fa fa-palette" >
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <InputComponent
                                    name="login_background_color"
                                    value={forms.login_background_color}
                                    onChange={handleChange}
                                    displayName="Login Background Color"
                                />
                                <span className={`mt-1 block text-xs ${isDark ? 'text-[#787b86]' : 'text-slate-500'}`}>Example: bg-skin-blue or a supported theme class.</span>
                            </div>
                            <div>
                                <InputComponent
                                    name="login_font_color"
                                    value={forms.login_font_color}
                                    onChange={handleChange}
                                    displayName="Login Font Color"
                                />
                                <span className={`mt-1 block text-xs ${isDark ? 'text-[#787b86]' : 'text-slate-500'}`}>Example: text-white or a supported text class.</span>
                            </div>
                        </div>
                        {login_background_image?.content
                        ?
                            <ExistingFileRow label="Login Background Image" file={login_background_image} onDelete={handleDelete} isDark={isDark} />
                        :
                            <div className="mb-3 w-full">
                                <InputFile name="login_background_image" onChange={handleChange} displayName="Login Background Image" />
                            </div>
                        }
                    </form>
                </Card>
            </div>
        </>
    )
}

export default Settings
