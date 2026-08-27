const AppNameWordmark = ({ name, accentClassName = 'text-[#2dd4bf]' }) => {
    if (!name) return null;
    const splitAt = Math.ceil(name.length / 2);
    return <>{name.slice(0, splitAt)}<span className={accentClassName}>{name.slice(splitAt)}</span></>;
};

export default AppNameWordmark;
