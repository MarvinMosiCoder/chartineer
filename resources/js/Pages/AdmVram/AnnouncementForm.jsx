import React, { useState, useEffect, useContext } from 'react';
import { useToast } from '../../Context/ToastContext';
import { useTheme } from '../../Context/ThemeContext';
import { Head } from '@inertiajs/react';
import { NavbarContext } from '../../Context/NavbarContext';
import InputComponent from '../../Components/Forms/Input';
import ContentPanel from '../../Components/Table/ContentPanel';
import WyswygTextEditor from '../../Components/Forms/WyswygTextEditor';
import axios from 'axios';
import DropdownSelect from '../../Components/Dropdown/Dropdown';
import Status from './Status';

const AnnouncementForm = ({ announcement, page_title, action }) => {
    const {theme} = useTheme();
    const isDark = theme === 'bg-skin-black';
    const { setTitle } = useContext(NavbarContext);
    const [loading, setLoading] = useState(false);
    const { handleToast } = useToast();
    const [errors, setErrors] = useState({});
    const selectedStatusOption = Status.find(option => option.id === announcement?.status);
    const [forms, setforms] = useState({
        a_id: announcement?.id || '',
        title: announcement?.title || '',
        message: announcement?.message || '',
        status: announcement?.status || '',
    });

    useEffect(() => {
        setTimeout(()=>{
            setTitle(page_title);
        });
    }, [page_title]);

    function handleChange(e) {
        const key = e.name ? e.name : e.target.name;
        const value = e.value ? e.value : e.target.value;
        setforms((forms) => ({
            ...forms,
            [key]: value,
        }));
        setErrors((prevErrors) => ({ ...prevErrors, [key]: '' }));
    }

    const validate = () => {
        const newErrors = {};
        if (!forms.title) newErrors.title = 'Title is required';
        if (!forms.message) {
            newErrors.message = 'Message is required';
        }
        return newErrors;
    };

    const handleSubmit = async (e, action) => {
        e.preventDefault();
        const newErrors = validate();
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
        } else {
            setLoading(true);
            const endpoint = action == 'Add' ? '/announcements/SaveAnnouncement' : '/announcements/saveEditAnnouncement';
            try {
                const response = await axios.post(endpoint, forms);

                handleToast(response.data.message, response.data.status);
            } catch (error) {
                if (error.response && error.response.status === 422) {
                    setErrors(error.response.data.errors);
                } else {
                    setErrors({
                        general: 'An error occurred. Please try again.',
                    });
                }
            } finally {
                setLoading(false);
            }
        }
    };
    return (
        <>
            <Head title={page_title} />
            <ContentPanel>
                <form onSubmit={(e) => handleSubmit(e, action)} className="space-y-5 p-2">
                    {errors.general && (
                        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
                            {errors.general}
                        </div>
                    )}
                    <div className="w-full">
                        <InputComponent
                            name="title"
                            value={forms.title}
                            onChange={handleChange}
                        />
                        {(errors.title) && (
                            <div className={`mt-1 text-sm font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                {errors.title}
                            </div>
                        )}
                    </div>
                    <div className="w-full">
                        <WyswygTextEditor name="message" value={forms.message} onChange={handleChange} error={errors.message} action={action}/>
                    </div>
                    {action === 'Edit' && (
                        <div className="w-full max-w-xs">
                            <DropdownSelect
                                selectType="select2"
                                displayName="Select a Status"
                                name="status"
                                options={Status}
                                value={{label:selectedStatusOption.name, value:selectedStatusOption.id}}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="h-11 w-full rounded-lg bg-[#2dd4bf] text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#14b8a6] hover:shadow-lg hover:shadow-teal-950/30 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                    >
                       {
                        action == 'Add'
                        ?
                        loading ? "Saving..." : "Save"
                        :
                        loading ? "Updating..." : "Update"
                       }
                    </button>

                </form>
            </ContentPanel>
        </>
    );
};

export default AnnouncementForm;
