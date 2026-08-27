import React, { useContext, useEffect, useState } from "react";
import ContentPanel from "../../Components/Table/ContentPanel";
import { Head, router } from "@inertiajs/react";
import { NavbarContext } from "../../Context/NavbarContext";
import { useProfile, useTheme } from "../../Context/ThemeContext";
import useThemeStyles from "../../Hooks/useThemeStyles";
import colorMap from "../../Components/Notification/ColorMap";
import axios from "axios";
import { useToast } from "../../Context/ToastContext";
import Modal from "../../Components/Modal/Modal";
import useThemeSwalColor from "../../Hooks/useThemeSwalColor";
import AvatarBadge from "../../Components/Profile/AvatarBadge";
import { AVATAR_CATALOG, getAvatarFromFileName } from "../../Components/Profile/avatarCatalog";

const ProfilePage = ({ page_title, user }) => {
    const { theme } = useTheme();
    const { profile, setProfile } = useProfile();
    const { setTitle } = useContext(NavbarContext);
    const swalColor = useThemeSwalColor(theme);
    const [loading, setLoading] = useState(false);
    const { textColor, scrollbarTheme, primayActiveColor, borderTheme, secondaryHoverBorderTheme } = useThemeStyles(theme);
    const [profileImage, setProfileImage] = useState();
    const { handleToast } = useToast();
    const [forms, setForms] = useState({
        profile_image: user?.profile || '',
    });
    const [showModalProfiles, setShowModalProfiles] = useState(false);
    const [pictureTab, setPictureTab] = useState('uploads');
    const [savingAvatar, setSavingAvatar] = useState(null);
    const [profiles, setProfiles] = useState([]);
    const [profileUpdate, setProfileUpdate] = useState(null);
    const [details, setDetails] = useState({
        name: user?.name ?? '',
        username: user?.username ?? '',
        timezone: user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
        trading_experience: user?.trading_experience ?? '',
    });
    const [detailsMessage, setDetailsMessage] = useState('');
    const [showDeactivate, setShowDeactivate] = useState(false);
    const [deactivationReason, setDeactivationReason] = useState('');
    const [deactivationConfirmation, setDeactivationConfirmation] = useState('');
    const [deactivationPassword, setDeactivationPassword] = useState('');
    const [deactivationError, setDeactivationError] = useState('');
    const requiresDeactivationPassword = Boolean(user?.password_login_enabled);
    const usernameChangedAt = user?.username_changed_at ? new Date(user.username_changed_at) : null;
    const usernameNextChangeAt = usernameChangedAt ? new Date(usernameChangedAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
    const usernameLocked = Boolean(usernameNextChangeAt && usernameNextChangeAt > new Date());
    const nameLocked = Boolean(user?.name_changed_at);

    useEffect(() => {
        setTitle(page_title);
    }, [page_title, setTitle]);
    
    const getInitials = (fullName) => {
        const names = fullName.split(" ");
        if (names.length === 1) {
            return names[0].charAt(0).toUpperCase();
        }
        const initials = names[0].charAt(0) + names[names.length - 1].charAt(0);
        return initials.toUpperCase();
    };
    
    const initials = getInitials(user.username || user.name);
    const backgroundColor = colorMap[initials.charAt(0)] || 'bg-slate-300';
    const activeFileName = profile ?? user.profile;
    const activeAvatar = !profileImage ? getAvatarFromFileName(activeFileName) : null;
    const hasUploadedImage = !activeAvatar && ((activeFileName && !profileImage) || profileImage);

    const selectAvatar = async (avatarKey) => {
        setSavingAvatar(avatarKey);
        try {
            const { data } = await axios.post('/profile/avatar', { avatar_key: avatarKey });
            handleToast(data.message, data.status);
            setProfileImage(undefined);
            setProfile(data.file_name);
            setShowModalProfiles(false);
            router.reload({ only: ['profile'] });
        } catch (error) {
            handleToast(error.response?.data?.message ?? 'Unable to update avatar.', 'error');
        } finally {
            setSavingAvatar(null);
        }
    };

    const handleImageChange = (e) => {
        const key = e.target.name;
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                setProfileImage(reader.result);
            };
            reader.readAsDataURL(file);
            setForms((forms) => ({
                ...forms,
                [key]: file,
            }));
        }
    };

    useEffect(() => {
        axios
            .get("/profiles")
            .then((response) => {
                setProfiles(response.data);
            })
            .catch((error) => {
                console.error(
                    "There was an error fetching profiles!",
                    error
                );
            });
    }, []);

    const handdleModalProfiles = () => {
        setShowModalProfiles(true);
    }
    const handleCloseModal = () => {
        setShowModalProfiles(false);
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await axios.post('/save-edit-image', forms, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            if (response.data.status === 'success') {
                handleToast(response.data.message, response.data.status);
                setShowModalProfiles(false);
                router.reload({ only: ['profile'] });
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

    const saveDetails = async (event) => {
        event.preventDefault();
        setLoading(true);
        setDetailsMessage('');
        try {
            const { data } = await axios.put('/profile/details', details);
            const message = data.message ?? 'Profile updated.';
            setDetailsMessage(message);
            handleToast(message, 'success');
        } catch (error) {
            const firstError = Object.values(error.response?.data?.errors ?? {}).flat().find(Boolean);
            const message = firstError ?? error.response?.data?.message ?? 'Unable to update profile details.';
            setDetailsMessage(message);
            handleToast(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const deactivateAccount = async () => {
        setLoading(true);
        setDeactivationError('');
        try {
            const { data } = await axios.post('/profile/deactivate', {
                confirmation: deactivationConfirmation,
                password: deactivationPassword,
                reason: deactivationReason,
            });
            window.location.assign(data.redirect ?? '/login');
        } catch (error) {
            const firstError = Object.values(error.response?.data?.errors ?? {}).flat().find(Boolean);
            setDeactivationError(firstError ?? error.response?.data?.message ?? 'Unable to deactivate the account.');
            setLoading(false);
        }
    };

    // PROFILE UPDATE
    const handleUpdateProfile = (e, id, file_name) => {
        e.preventDefault();
        setProfileUpdate(id);
        setProfile(file_name);
    }

    const handleProfileUpdate = async (e, id, action) => {
        e.preventDefault();
        setLoading(true);
    
        try {
            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                responseType: action === 'download' ? 'blob' : 'json', // Handle binary data for download
            };
    
            const response = await axios.post('/update-profile', {
                id: id ?? profileUpdate,
                action: action,
            }, config);
    
            if (action === 'download') {
                // Create a blob from the response
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
    
                // Extract filename from headers or use a default one
                const contentDisposition = response.headers['content-disposition'];
                const fileName = contentDisposition
                    ? contentDisposition.split('filename=')[1].replace(/"/g, '')
                    : 'downloaded_file';
    
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
            } else if (response.data.status === 'success') {
                Swal.fire({
                    type: response.data.status,
                    title: response.data.message,
                    icon: response.data.status,
                    confirmButtonColor: swalColor,
                }).then((result) => {
                    if (result.isConfirmed) {
                        setShowModalProfiles(false);
                    }
                });
            } else {
                Swal.fire({
                    type: response.data.status,
                    title: response.data.message,
                    icon: response.data.status,
                    confirmButtonColor: swalColor,
                });
            }
        } catch (error) {
            Swal.fire({
                type: 'error',
                title: 'An error occurred while updating profile',
                icon: 'error',
                confirmButtonColor: swalColor,
            });
        } finally {
            setLoading(false);
        }
    };
    

    return (
        <>
            <Head title={page_title} />
            <div className="from-blue-50 to-indigo-100 flex items-center justify-center">
                <ContentPanel className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col justify-center items-center">
                            {/* Profile Picture */}
                            <div className="relative">
                                {activeAvatar ? (
                                    <div className="w-48 h-48 border-4 border-gray-300 rounded-full overflow-hidden mb-5 shadow-md cursor-pointer">
                                        <AvatarBadge avatar={activeAvatar} sizeClassName="text-[90px]"/>
                                    </div>
                                ) : hasUploadedImage ? (
                                    <div
                                        className={`w-48 h-48 border-4 border-gray-300 rounded-full overflow-hidden mb-5 shadow-md cursor-pointer`}
                                    >
                                        <img
                                            src={ activeFileName && !profileImage ? `/images/profile/`+ activeFileName : profileImage }
                                            alt="User Avatar"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className={`${backgroundColor} w-48 h-48 border-4 border-gray-300 rounded-full overflow-hidden mb-5 shadow-md cursor-pointer`}
                                    >
                                        <p className="text-slate-800 font-poppins text-center mt-5 text-[90px]">
                                            {initials}
                                        </p>
                                    </div>
                                )}

                                {/* Change picture button */}
                                <button
                                    type="button"
                                    onClick={handdleModalProfiles}
                                    aria-label="Change profile picture"
                                    className={`absolute bottom-6 right-3 border-4 border-gray-300 bg-gray-100 text-gray-600 px-[11px] py-[7px] rounded-[120px] shadow-md hover:bg-gray-200 cursor-pointer`}
                                >
                                    <i className="fa fa-camera"></i>
                                </button>
                            </div>

                            {/* User Details */}
                            <div className="text-center">
                                <p className={`font-bold text-3xl ${theme === 'bg-skin-black' ? ' text-gray-400' : 'text-gray-800'} mb-2`}>{user.username || user.name}</p>
                                <p className={`text-lg ${theme === 'bg-skin-black' ? ' text-gray-400' : 'text-gray-600'}`}>{user.email}</p>
                            </div>
                            <div className={`mt-7 w-full max-w-xl rounded-xl border p-5 text-left ${theme === 'bg-skin-black' ? 'border-[#2a2e39] bg-[#0b0e14] text-[#d1d4dc]' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
                                <div className="mb-4"><h2 className="text-sm font-bold">Profile details</h2><p className="mt-1 text-xs text-[#787b86]">Your username identifies you in feedback and future community features. Timezone keeps reports and sessions understandable.</p></div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="text-xs font-semibold">Display name<input value={details.name} disabled={nameLocked} onChange={(e)=>setDetails((c)=>({...c,name:e.target.value}))} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2e39] bg-transparent px-3 text-sm outline-none focus:border-[#2dd4bf] disabled:opacity-50" required/>{nameLocked ? <span className="mt-1 block text-[10px] font-normal normal-case text-amber-500">Your display name has already been changed and can't be changed again here.</span> : <span className="mt-1 block text-[10px] font-normal normal-case text-[#787b86]">You can change this once — choose carefully, it can't be edited again afterward.</span>}</label>
                                    <label className="text-xs font-semibold">Username<input value={details.username} disabled={usernameLocked} onChange={(e)=>setDetails((c)=>({...c,username:e.target.value}))} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2e39] bg-transparent px-3 text-sm outline-none focus:border-[#2dd4bf] disabled:opacity-50" placeholder="trader.name"/>{usernameLocked && <span className="mt-1 block text-[10px] font-normal normal-case text-amber-500">You can change your username again on {usernameNextChangeAt.toLocaleDateString()}.</span>}</label>
                                    <label className="text-xs font-semibold">Timezone<input value={details.timezone} onChange={(e)=>setDetails((c)=>({...c,timezone:e.target.value}))} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2e39] bg-transparent px-3 text-sm outline-none focus:border-[#2dd4bf]" placeholder="Asia/Manila"/></label>
                                    <label className="text-xs font-semibold">Trading experience<select value={details.trading_experience} onChange={(e)=>setDetails((c)=>({...c,trading_experience:e.target.value}))} className="mt-1.5 h-10 w-full rounded-lg border border-[#2a2e39] bg-transparent px-3 text-sm outline-none focus:border-[#2dd4bf]"><option value="">Not specified</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="professional">Professional</option></select></label>
                                </div>
                                {detailsMessage && <div className="mt-3 text-xs text-[#5eead4]">{detailsMessage}</div>}
                                <button type="button" onClick={saveDetails} disabled={loading} className="mt-4 h-10 rounded-lg bg-[#2dd4bf] px-4 text-xs font-bold text-white disabled:opacity-50">{loading?'Saving…':'Save profile details'}</button>
                            </div>
                        </div>
                        {/* Action Buttons */}
                        <div className="mt-8 lg:flex justify-center gap-4">
                            <div
                                className={`px-6 py-2 mb-1 ${theme === 'bg-skin-white' ? primayActiveColor : theme} text-white text-center rounded-lg shadow-md hover:opacity-80 cursor-pointer transition-all`}
                                onClick={handdleModalProfiles}
                            >
                                <i className="fa fa-images"></i> Change profile picture
                            </div>
                        </div>
                    </form>

                    <section className={`mx-auto mt-8 w-full max-w-xl rounded-xl border p-5 ${theme === 'bg-skin-black' ? 'border-red-500/30 bg-red-950/20 text-[#d1d4dc]' : 'border-red-200 bg-red-50 text-slate-900'}`}>
                        <h2 className="text-sm font-bold text-red-500">Deactivate account</h2>
                        <p className="mt-2 text-xs leading-5 text-[#787b86]">Deactivation signs you out, disables price alerts, freezes paper-trading activity, and blocks all account access. Your charts, drawings, sessions, orders, journal, payment records, and trading history are preserved. Trial and paid-access dates continue to run. An administrator is required to reactivate the account.</p>
                        {!showDeactivate ? (
                            <button type="button" onClick={() => setShowDeactivate(true)} className="mt-4 h-10 rounded-lg border border-red-500 px-4 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white">Deactivate my account</button>
                        ) : (
                            <div className="mt-4 grid gap-3">
                                <label className="text-xs font-semibold">Reason (optional)<textarea rows="3" maxLength="500" value={deactivationReason} onChange={(event) => setDeactivationReason(event.target.value)} className="mt-1.5 w-full rounded-lg border border-red-500/40 bg-transparent px-3 py-2 text-sm outline-none focus:border-red-500" /></label>
                                {requiresDeactivationPassword && <label className="text-xs font-semibold">Current password<input type="password" value={deactivationPassword} onChange={(event) => setDeactivationPassword(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-red-500/40 bg-transparent px-3 text-sm outline-none focus:border-red-500" autoComplete="current-password" /></label>}
                                <label className="text-xs font-semibold">Type DEACTIVATE to confirm<input value={deactivationConfirmation} onChange={(event) => setDeactivationConfirmation(event.target.value.toUpperCase())} className="mt-1.5 h-10 w-full rounded-lg border border-red-500/40 bg-transparent px-3 text-sm outline-none focus:border-red-500" /></label>
                                {deactivationError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-500">{deactivationError}</div>}
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button type="button" onClick={deactivateAccount} disabled={loading || deactivationConfirmation !== 'DEACTIVATE' || (requiresDeactivationPassword && !deactivationPassword)} className="h-10 rounded-lg bg-red-600 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{loading ? 'Deactivating…' : 'Confirm deactivation'}</button>
                                    <button type="button" onClick={() => { setShowDeactivate(false); setDeactivationError(''); }} disabled={loading} className="h-10 rounded-lg border border-gray-500 px-4 text-xs font-semibold">Cancel</button>
                                </div>
                            </div>
                        )}
                    </section>
                </ContentPanel>
                <Modal
                    theme={theme === 'bg-skin-white' ? primayActiveColor : theme}
                    show={showModalProfiles}
                    onClose={handleCloseModal}
                    title="Profile picture"
                    width="xl"
                    fontColor={theme === 'bg-skin-white' ? 'text-white' : textColor}
                    // withButton="button"
                    onClick={handleProfileUpdate}
                    icon='fa fa-images'
                    btnIcon='fa fa-refresh'
                    isDelete='delete'
                >
                    <div className="mb-4 flex gap-2 border-b border-gray-300 pb-2">
                        <button type="button" onClick={() => setPictureTab('uploads')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${pictureTab === 'uploads' ? `${theme === 'bg-skin-white' ? primayActiveColor : theme} text-white` : 'bg-gray-100 text-gray-600'}`}>Your uploads</button>
                        <button type="button" onClick={() => setPictureTab('avatar')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${pictureTab === 'avatar' ? `${theme === 'bg-skin-white' ? primayActiveColor : theme} text-white` : 'bg-gray-100 text-gray-600'}`}>Choose avatar</button>
                    </div>
                    {pictureTab === 'avatar' ? (
                        <div className="pb-6">
                            <p className="mb-4 text-sm text-gray-500">Pick a system-provided avatar. More styles will be added over time.</p>
                            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                                {AVATAR_CATALOG.map(avatar => (
                                    <button
                                        key={avatar.key}
                                        type="button"
                                        disabled={savingAvatar !== null}
                                        onClick={() => selectAvatar(avatar.key)}
                                        className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition disabled:opacity-50 ${activeAvatar?.key === avatar.key ? `${borderTheme} shadow-lg` : 'border-transparent hover:border-gray-300'}`}
                                    >
                                        <span className="h-16 w-16 overflow-hidden rounded-full shadow-md"><AvatarBadge avatar={avatar} sizeClassName="text-3xl"/></span>
                                        <span className="text-xs font-semibold text-gray-500">{savingAvatar === avatar.key ? 'Saving…' : avatar.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                    <form>
                        <div className="mb-5 flex flex-col items-center gap-3 border-b border-gray-200 pb-5 sm:flex-row sm:justify-between">
                            <label htmlFor="upload-image" className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                                <i className="fa fa-upload"></i> {profileImage ? 'Choose a different photo' : 'Choose a photo to upload'}
                                <input id="upload-image" type="file" accept="image/*" className="hidden" name="profile_image" onChange={handleImageChange} />
                            </label>
                            {profileImage && (
                                <div className="flex items-center gap-3">
                                    <img src={profileImage} alt="Selected preview" className="h-12 w-12 rounded-full border object-cover" />
                                    <button type="button" onClick={handleSubmit} disabled={loading} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${theme === 'bg-skin-white' ? primayActiveColor : theme}`}>{loading ? 'Uploading…' : 'Upload'}</button>
                                </div>
                            )}
                        </div>
                        <div className={`flex flex-wrap items-center justify-center pb-10 gap-2 max-h-[600px] overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar  scrollbar-thin ${scrollbarTheme} scrollbar-track-gray-200`}>
                            {profiles.length > 0 ? (
                                profiles.map((item, index) => (
                                    <div
                                        className={`relative flex items-center shadow-md border-2 mt-8 ${
                                            item.id === profileUpdate ? `border-[3px] ${borderTheme} shadow-lg` : `border-gray-300`
                                        } justify-center cursor-pointer ${secondaryHoverBorderTheme} rounded-md shadow-lg`}
                                        key={index}
                                        onClick={(e) => handleUpdateProfile(e, item.id, item.file_name)}
                                    >
                                        <img
                                            src={`/images/profile/` + item.file_name}
                                            alt="User Avatar"
                                            className="w-[200px] max-w-[200px] lg:w-40 h-40 rounded-md"
                                        />
                                        <div className="absolute top-[167px] left-[41px] md:left-[41px] lg:left-[1px]">
                                            <button className={`absolute  left-[72px] rounded-md px-[5px]  ${textColor} bg-sky-700`}
                                            onClick={(e) => handleProfileUpdate(e, item.id, 'download')}
                                            >
                                                <i className="fa fa-cloud-download-alt text-[14px]"></i>
                                            </button>
                                            <button className={`absolute left-[104px] rounded-md px-[7px]  ${textColor} bg-red-700`}
                                            onClick={(e) => handleProfileUpdate(e, item.id, 'delete')}>
                                                <i className="fa fa-trash-alt text-[14px]"></i>
                                            </button>
                                            <button className={`absolute left-[133px] rounded-md px-[7px]  ${textColor} bg-green-700`}
                                            onClick={(e) => handleProfileUpdate(e, item.id, 'update')}
                                            >
                                                <i className="fa fa-refresh text-[14px]"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-gray-500 text-center mt-4 ml-[120px]">
                                    No profiles available to display.
                                </div>
                            )}
                        </div>
                    </form>
                    )}
                </Modal>
            </div>
        </>
    );
};

export default ProfilePage;
