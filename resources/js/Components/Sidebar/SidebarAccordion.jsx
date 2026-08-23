import { Link, usePage } from "@inertiajs/react";
import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import { NavbarContext } from "../../Context/NavbarContext";
import { useTheme } from "../../Context/ThemeContext";
import useThemeStyles from "../../Hooks/useThemeStyles";

const SidebarAccordion = ({ open, closeSidebar }) => {
    const [activeIndex, setActiveIndex] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndexAdmin, setActiveIndexAdmin] = useState(null);
    const [isOpenAdmin, setIsOpenAdmin] = useState(false);
    const [links, setLinks] = useState([]);
    const { setTitle } = useContext(NavbarContext);
    const { auth } = usePage().props;
    const {theme} = useTheme();
    const [pathname, setPathname] = useState(null);
    const { textColor, hoverTextColor, textColorActive, borderColor, hoverColor, scrollbarTheme } = useThemeStyles(theme);
    const convertText = (input) => {
        return input
            .replace(/^bg-/, '') // Remove the prefix 'bg-'
            .split('-') // Split the string by '-'
            .map(word => word.charAt(0) + word.slice(1)) // Capitalize each word
            .join('-'); // Join the words with a dash
    }

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setIsOpen(false);
            }else{
                setIsOpen(true);
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, [links]);

    const SuperAdminMenus = [
        {
            name: "Privileges",
            url: "privileges",
            image: "/images/navigation/privileges-icon.png",
            icon: "fa fa-crown",
        },
        {
            name: "Users Management",
            url: "users",
            image: "/images/navigation/user-management-icon.png",
            icon: "fa fa-users",
        },
        {
            name: "Menu Management",
            url: "menu_management",
            image: "/images/navigation/menu-icon-2.png",
            icon: "fa fa-bars",
        },
        {
            name: "Module Generator",
            url: "module_generator",
            image: "/images/navigation/module-icon.png",
            icon: "fa fa-th",
        },
        {
            name: "Settings",
            url: "adm_settings",
            image: "/images/navigation/module-icon.png",
            icon: "fa fa-cogs",
            children: [
                {
                    name: "App Settings",
                    url: "settings",
                    image: "/images/navigation/module-icon.png",
                    icon: "fa fa-cogs",
                },
                {
                    name: "Announcements",
                    url: "announcements",
                    image: "/images/navigation/module-icon.png",
                    icon: "fa fa-info-circle",
                },
                {
                    name: "Notifications",
                    url: "notifications",
                    image: "/images/navigation/module-icon.png",
                    icon: "fa fa-bell",
                }
            ]
        },
        {
            name: "Log User Access",
            url: "logs",
            image: "/images/navigation/logs-icon.png",
            icon: "fa fa-history",
        },
    ];
   
    useEffect(() => {
        if (!open) {
            setIsOpen(false);
        }
    }, [open]);

    useEffect(() => {
        const storedActiveIndex = JSON.parse(localStorage.getItem("activeIndex"));
        const storedActiveIndexAdmin = JSON.parse(localStorage.getItem("activeIndexAdmin"));
        const storedPathname = JSON.parse(localStorage.getItem("url"));

        if (storedActiveIndex !== null) {
            setActiveIndex(storedActiveIndex);
            setIsOpen(true);
        }

        if (storedActiveIndexAdmin !== null) {
            setActiveIndexAdmin(storedActiveIndexAdmin);
            setIsOpenAdmin(true);
        }

        if (storedPathname) {
            setPathname(storedPathname);
        }
    }, []);

    const handleToggle = (index, url) => {
        setPathname(url);
        localStorage.setItem("url", JSON.stringify(url));

        if (activeIndex === index) {
            setActiveIndex(null);
            setIsOpen(false);
            localStorage.removeItem("activeIndex");
        } else {
            setActiveIndex(index);
            setIsOpen(true);
            localStorage.setItem("activeIndex", JSON.stringify(index));
        }

        setIsOpenAdmin(false);
        setActiveIndexAdmin(null);
    };

    const handleToggleAdmin = (index, url) => {
        setPathname(url);
        localStorage.setItem("url", JSON.stringify(url));

        if (activeIndexAdmin === index) {
            setActiveIndexAdmin(null);
            setIsOpenAdmin(false);
            localStorage.removeItem("activeIndexAdmin");
        } else {
            setActiveIndexAdmin(index);
            setIsOpenAdmin(true);
            localStorage.setItem("activeIndexAdmin", JSON.stringify(index));
        }

        setIsOpen(false);
        setActiveIndex(null);
    };
  
    const formatActiveSlug = (pathname) => {
        const segments = pathname.split("/");
        const lastSegment = segments.pop() || segments.pop();
        return lastSegment;
    };

    useEffect(() => {
        axios
            .get("/sidebar")
            .then((response) => {
                setLinks(response.data);
                setIsOpen(true);
            })
            .catch((error) => {
                console.error(
                    "There was an error fetching the sidebar data!",
                    error
                );
            });
    }, []);

    const handleMenuClick = (newTitle) => {
        setTitle(newTitle);
    };

    return (
        <div
            className={`max-h-[calc(100%_-_4rem)] min-w-[210px] overflow-x-hidden  ${
                open ? `overflow-y-auto mt-3 pr-[5px] scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar  scrollbar-thin ${scrollbarTheme} scrollbar-track-gray-200` : "overflow-y-hidden"
            }`}
        >
            <ul>
                <Link
                    href={`${window.location.origin}/dashboard`}
                    onClick={() => {
                        handleMenuClick("Dashboard");
                        setIsOpen(false);
                        closeSidebar();
                    }}
                >
                    <li
                        className={`${hoverColor} ${hoverTextColor} text-sm flex items-center gap-x-4 cursor-pointer px-3 py-3 rounded-[6px] mb-2 
                            ${pathname === "dashboard" ? 
                                (theme === 'bg-skin-black' ?
                                        theme+`-active text-gray-100` : theme+`-active ${textColorActive}`
                                )
                                    : 
                                    (theme === 'bg-skin-black' ? textColorActive : textColor)
                            } group`}
                            onClick={() =>{
                            handleToggle('', 'dashboard');
                        }}
                    >
                        <img
                            src={
                                (pathname === "dashboard" &&  theme === 'bg-skin-black' ? 
                                    `/images/navigation/dashboard-icon.png` 
                                    : 
                                    (pathname === "dashboard" &&  !['bg-skin-black'].includes(theme) ? 
                                        `/images/navigation/dashboard-icon.png`
                                        : 
                                        (!['bg-skin-black'].includes(theme) ? `/images/navigation/dashboard-icon-black.png` : `/images/navigation/dashboard-icon.png`)
                                    )
                                )   
                            }
                            className={`w-[16px] h-[16px] ml-[1px] group-hover:hidden`}
                        />
                        <img
                            src={`/images/navigation/dashboard-icon.png`}
                            className={`w-[16px] h-[16px] ml-[1px] hidden group-hover:block`}
                        />
                        <p
                            className={`font-poppins font-semibold single-line max-w-[500px] text-[13px] ${!open && "hidden"}`}
                        >
                            Dashboard
                        </p>

                    </li>
                </Link>
                <Link
                    href={`${window.location.origin}/trade-report`}
                    onClick={() => {
                        handleMenuClick("Trade Report");
                        setIsOpen(false);
                        closeSidebar();
                    }}
                >
                    <li
                        className={`${hoverColor} ${hoverTextColor} text-sm flex items-center gap-x-4 cursor-pointer px-3 py-3 rounded-[6px] mb-2 
                            ${pathname === "trade-report" ? 
                                (theme === 'bg-skin-black' ?
                                        theme+`-active text-gray-100` : theme+`-active ${textColorActive}`
                                )
                                    : 
                                    (theme === 'bg-skin-black' ? textColorActive : textColor)
                            } group`}
                            onClick={() =>{
                            handleToggle('', 'trade-report');
                        }}
                    >
                        <i
                            className="fa fa-calendar-days ml-[1px] text-[15px] text-center"
                            style={{
                                fontSize: "17px",
                                width: "16px",
                                textAlign: "center",
                            }}
                        ></i>
                        <p
                            className={`font-poppins font-semibold single-line max-w-[500px] text-[13px] ${!open && "hidden"}`}
                        >
                            Trade Report
                        </p>

                    </li>
                </Link>
            </ul>
            {links.map((item, index) => (
                <div
                    key={index}
                    className={`${textColor} text-[14px] font-poppins mb-2 `}
                >
                    {item.children ? (
                        <div
                            className={`flex cursor-pointer items-center justify-between px-[5px] py-[12px] ${hoverColor} ${hoverTextColor} rounded-[6px] 
                                ${ pathname === item.url_path ? 
                                    (theme === 'bg-skin-white' ? 
                                        theme+"-active text-white" 
                                        : 
                                        (theme === 'bg-skin-black' ? theme+`-active ${hoverTextColor}` : theme+`-active ${textColorActive}`)
                                    ) 
                                        : 
                                        (theme === 'bg-skin-black' ? textColorActive : textColor)
                                }
                            `}
                            onClick={() => {
                                handleToggle(index, item.url_path); 
                                handleMenuClick(item.name); 
                            }}
                                style={{
                                display: "flex",
                                alignItems: "center",  // Center items vertically
                            }}
                        >
                            <i className={`ml-[7px] ${item.icon} text-[15px]`}
                                style={{
                                    fontSize: "17px",     
                                    width: "16px",         
                                    textAlign: "center", 
                                }}
                            ></i>
                            <span
                                className={`pl-4 flex-1 text-[13px] font-semibold  ${
                                    !open && "hidden"
                                } `}
                                style={{
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {item.name}
                            </span>
                            <div className="mr-2">
                                <i
                                    className={`fa fa-angle-down text-[11px] transition-transform duration-300 ${
                                        activeIndex === index && isOpen ? "rotate-180" : ""
                                    } ${!open ? "hidden" : ""} ${item.children ? "" : "hidden"}`}
                                />   
                            </div>
                        </div>
                    ) : (
                        <Link
                            href={item.url}
                            onClick={() => { 
                                handleMenuClick(item.name);
                                closeSidebar();
                            }}
                        >
                            <div
                                className={`relative flex cursor-pointer items-center justify-between px-[5px] py-[12px] ${hoverColor} ${hoverTextColor} rounded-[6px] 
                                    ${ pathname === item.url_path ? 
                                        (theme === 'bg-skin-white' ? 
                                            theme+"-active text-white" 
                                            : 
                                            (theme === 'bg-skin-black' ? theme+`-active ${ hoverTextColor }` : theme+`-active ${ textColorActive }`)
                                        ) 
                                            : 
                                            (theme === 'bg-skin-black' ? textColorActive : textColor)
                                    }
                                `}
                                onClick={() => handleToggle(index, item.url_path)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",  // Center items vertically
                                }}
                            >
                                <i
                                    className={`ml-[7px] ${item.icon} text-[15px] text-center`}
                                    style={{
                                        fontSize: "17px",     
                                        width: "16px",         
                                        textAlign: "center", 
                                    }}
                                ></i>
                                <span
                                    className={`pl-4 flex-1 text-[13px] font-semibold single-lines ${
                                        !open && "hidden"
                                    } `}
                                    style={{
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {item.name}
                                </span>
                                <div className="mr-2">
                                    <i
                                        className={`fa fa-angle-down text-[11px] transition-transform duration-300 ${
                                            activeIndex === index && isOpen ? "rotate-180" : ""
                                        } ${!open ? "hidden" : ""} ${item.children ? "" : "hidden"}`}
                                    />   
                                </div>
                            </div>
                        </Link>
                    )}

                    <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out  ${
                            activeIndex === index && isOpen
                                ? "max-h-[300vh] opacity-100"
                                : "max-h-0 opacity-0"
                        }`}
                    >
                        {item.children && (
                            <div>
                                {item.children.map((child, childIndex) => (
                                    <Link
                                        href={child.url}
                                        onClick={() =>{
                                                handleMenuClick(
                                                    item.name + " - " + child.name
                                                );
                                                closeSidebar();
                                            }
                                        }
                                        key={childIndex}
                                    >                  
                                        <div
                                            className={` ml-3 transition-opacity duration-500 flex relative  ${
                                                isOpen
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            }`}
                                            key={childIndex}
                                        >
                                            <div
                                                className={`h-full w-2 absolute  ${
                                                    item.children.length ==
                                                    childIndex + 1
                                                        ? ""
                                                        : "border-l-2"
                                                }`}
                                            ></div>
                                            <div className="flex flex-col last:border-none">
                                                <div className="border-l-2 border-b-2 rounded-bl-[5px] flex-1 w-6"></div>
                                                <div className="border-l-none flex-1 w-2 "></div>
                                            </div>
                                            <div
                                                className={`p-2 flex flex-1 items-center rounded-[5px] my-1 ${hoverColor} ${hoverTextColor} cursor-pointer 
                                                ${
                                                    open &&
                                                    formatActiveSlug(
                                                        window.location.pathname
                                                    ) === child.url_path
                                                        ? theme+"-active"
                                                        : ""
                                                }
                                                ${ 
                                                    formatActiveSlug(
                                                        window.location.pathname
                                                    ) === child.url_path && !['bg-skin-black'].includes(theme) ? textColorActive : textColor}
                                                `}
                                            >
                                                <i
                                                    className={` ${
                                                        child.icon
                                                    } text-[12px]  ${
                                                        !open && "hidden"
                                                    }`}
                                                ></i>
                                                <p
                                                    className={`text-[12px] scale-0`}
                                                >
                                                    I
                                                </p>
                                                <p
                                                    className={`text-[12px] ml-2 ${
                                                        !open && "hidden"
                                                    } `}
                                                    style={{
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow:
                                                            "ellipsis",
                                                    }}
                                                >
                                                    {child.name}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {/* SUPER ADMIN SIDE */}
            {auth?.role?.isSuperadmin ? (
                <div className={`${['bg-skin-black','bg-skin-black-light'].includes(theme) ? `text-gray-400` : `text-gray-500`} mt-4`}>
                    <div
                        className={`font-poppins text-[14px] ${
                            !open ? `text-center border-t ${borderColor} opacity-30` : ""
                        }`}
                        style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            paddingTop: '5px'
                        }}
                    >
                        {open ? <div>SUPERADMIN</div> : ''}
                    </div>
                    {/* MENUS */}
                  
                    {SuperAdminMenus.map((menu, index) => (
                        <div
                            key={index}
                            className={`${textColor} text-[13px] font-poppins mb-2 mt-3`}
                        >
                            {menu.children ? (
                                <div
                                    className={`flex cursor-pointer items-center justify-between px-[5px] py-[12px] ${hoverColor} ${hoverTextColor} rounded-[6px] 
                                        ${ pathname === menu.url ? 
                                            (theme === 'bg-skin-white' ? 
                                                theme+"-active text-white" 
                                                : 
                                                (theme === 'bg-skin-black' ? theme+`-active ${hoverTextColor}` : theme+`-active ${textColorActive}`)
                                            ) 
                                                : 
                                                (theme === 'bg-skin-black' ? textColorActive : textColor)
                                        }
                                    `}
                                    onClick={() => handleToggleAdmin(index, menu.url)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",  // Center items vertically
                                    }}
                                >
                                    <i className={`ml-1 ${menu.icon} text-[15px]`}  
                                        style={{
                                            fontSize: "17px",     
                                            width: "19px",         
                                            textAlign: "center", 
                                        }}
                                    ></i>
                                    <span
                                        className={`pl-4 flex-1 font-semibold  ${
                                            !open && "hidden"
                                        } `}
                                        style={{
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {menu.name}
                                    </span>
                                    <div className="mr-2">
                                        <i
                                            className={`fa fa-angle-down text-[11px] transition-transform duration-300 ${
                                                activeIndexAdmin === index && isOpenAdmin ? "rotate-180" : ""
                                            } ${!open ? "hidden" : ""} ${menu.children ? "" : "hidden"}`}
                                        />                                       
                                    </div>
                                </div>                         
                            ) : (
                                <Link
                                    href={`${window.location.origin}/`+menu.url}
                                    onClick={() =>{
                                        handleMenuClick(menu.name)
                                        closeSidebar();
                                    }}
                                >
                                    <div
                                        className={`flex cursor-pointer text-sm items-center cursor-pointer justify-between px-[4px] py-[12px] ${hoverColor} ${hoverTextColor} rounded-[6px] 
                                            ${ pathname === menu.url ? 
                                                (theme === 'bg-skin-white' ? 
                                                    theme+"-active text-white" 
                                                    : 
                                                    (theme === 'bg-skin-black' ? theme+`-active ${hoverTextColor}` : theme+`-active ${textColorActive}`)
                                                ) 
                                                    : 
                                                    (theme === 'bg-skin-black' ? textColorActive : textColor)
                                            }
                                        `}
                                        onClick={() => handleToggleAdmin(index, menu.url)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",  // Center items vertically
                                        }}
                                    >
                                        <i
                                            className={`ml-[7px] ${menu.icon} text-center`}
                                            style={{
                                                fontSize: "16px",     
                                                width: "18px",         
                                                textAlign: "center", 
                                            }}
                                        ></i>
                                        <span
                                            className={`pl-4 flex-1 font-semibold text-[13px] single-lines ${
                                                !open && "hidden"
                                            } `}
                                            style={{
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {menu.name}
                                        </span>
                                        <div className="mr-2">
                                            <i
                                                className={`fa fa-angle-down text-[11px] transition-transform duration-300 ${
                                                    activeIndexAdmin === index && isOpenAdmin ? "rotate-180" : ""
                                                } ${!open ? "hidden" : ""} ${menu.children ? "" : "hidden"}`}
                                            />   
                                        </div>
                                    </div>
                                </Link>
                            )}
                            <div
                                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                    activeIndexAdmin === index && isOpenAdmin
                                        ? "max-h-screen opacity-100"
                                        : "max-h-0 opacity-0"
                                }`}
                            >
                                {menu.children && (
                                    <div>
                                        {menu.children.map((child, childIndex) => (
                                            <Link
                                                href={`${window.location.origin}/`+child.url}
                                                onClick={() =>{
                                                    handleMenuClick(
                                                        menu.name + " - " + child.name
                                                    );
                                                    closeSidebar();
                                                }
                                                }
                                                key={childIndex}
                                                
                                            >
                                                <div
                                                    className={` ml-3  transition-opacity duration-500 flex relative ${
                                                        isOpenAdmin
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    }`}
                                                    key={childIndex}
                                                    
                                                >
                                                    <div
                                                        className={`h-full w-2 absolute  ${
                                                            menu.children.length ==
                                                            childIndex + 1
                                                                ? ""
                                                                : "border-l-2"
                                                        }`}
                                                    ></div>
                                                    <div className="flex flex-col last:border-none">
                                                        <div className="border-l-2 border-b-2 rounded-bl-[5px] flex-1 w-6"></div>
                                                        <div className="border-l-none flex-1 w-2 "></div>
                                                    </div>
                                                    <div
                                                        className={`p-2 flex flex-1 items-center rounded-[5px] my-1 ${hoverColor} ${hoverTextColor} cursor-pointer 
                                                            ${
                                                                open &&
                                                                formatActiveSlug(
                                                                    window.location.pathname
                                                                ) === child.url
                                                                    ? theme+"-active"
                                                                    : ""
                                                            }
                                                            ${ 
                                                                formatActiveSlug(
                                                                window.location.pathname
                                                                ) === child.url && !['bg-skin-black'].includes(theme) ? textColorActive : textColor
                                                            }
                                                        `}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center", 
                                                        }}
                                                    >
                                                        <i
                                                            className={` ${
                                                                child.icon
                                                            } text-[12px]  ${
                                                                !open && "hidden"
                                                            }`}
                                                            style={{
                                                                fontSize: "14px",     
                                                                width: "18px",         
                                                                textAlign: "center", 
                                                            }}
                                                        ></i>
                                                        <p
                                                            className={`text-[12px] scale-0`}
                                                        >
                                                            I
                                                        </p>
                                                        <p
                                                            className={`text-[12px] ml-2 ${
                                                                !open && "hidden"
                                                            } `}
                                                            style={{
                                                                whiteSpace: "nowrap",
                                                                overflow: "hidden",
                                                                textOverflow:
                                                                    "ellipsis",
                                                            }}
                                                        >
                                                            {child.name}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                  
                </div>
            ) : (
                ""
            )}
        </div>
    );
};

export default SidebarAccordion;
