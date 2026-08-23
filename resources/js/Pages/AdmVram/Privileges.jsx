import { Head, router, usePage } from '@inertiajs/react';
import React, { useEffect, useState } from 'react';
import ContentPanel from '../../Components/Table/ContentPanel';
import TopPanel from '../../Components/Table/TopPanel';
import TableContainer from '../../Components/Table/TableContainer';
import Thead from '../../Components/Table/Thead';
import TableHeader from '../../Components/Table/TableHeader';
import Row from '../../Components/Table/Row';
import RowData from '../../Components/Table/RowData';
import TableSearch from '../../Components/Table/TableSearch';
import RowAction from '../../Components/Table/RowAction';
import Pagination from '../../Components/Table/Pagination';
import Tbody from '../../Components/Table/Tbody';
import { useTheme } from '../../Context/ThemeContext';
import Button from '../../Components/Table/Buttons/Button';
import Filters from '../../Components/Table/Buttons/Filters';
import useThemeStyles from '../../Hooks/useThemeStyles';
import useFilters from '../../Hooks/useFilters';
import FilterSearchOptions from '../../Components/Table/FilterSearchOptions';
import axios from 'axios';
import FilterFields from '../../Components/Table/Buttons/FilterFields';
import ExportDataModal from '../../Components/Modal/ExportDataModel';
import { IconTooltipButton } from '../../Components/Tooltip/AnchoredTooltip';

const Privileges = ({ tableName, privileges, queryParams }) => {
    const { auth } = usePage().props;
    const {theme} = useTheme();
    const isDark = theme === 'bg-skin-black';
    queryParams = queryParams || {};
    const [loading, setLoading] = useState(false);
    const { textColor, primayActiveColor, textColorActive, whiteBgCoror } = useThemeStyles(theme);
    const [pathname, setPathname] = useState(null);
    const [filterData, setFilterData] = useState([]);
    const { filters, handleFilter, handleFilterSubmit, handleSorting, handleType, handleDateChange } = useFilters(pathname);
    const [isModalOpen, setIsModalOpen] = useState(false);
    useEffect(() => {
        const segments = window.location.pathname.split("/");
        setPathname(segments.pop());
    }, []);

    useEffect(() => {
        router.reload({ only: ['privileges'] });
    }, []);

    useEffect(() => {
        axios
            .get('/filter/privileges')
            .then((response) => {
                setFilterData(response.data);
            })
            .catch((error) => {
                console.error(
                    'There was an error fetching the data!',
                    error
                );
            });
    }, []);

    const refreshTable = (e) => {
        e.preventDefault();
        router.get(pathname);
    };

    const formatLabel = (label) => {
        return label
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()); 
    };

    const settings = {
        default_paper_size: "Letter",
    };
    
    const handleExport = (exportData) => {
        exportData.table_name = tableName;
        exportData.columns = Object.keys(filterData[0]);
        exportData.filters = JSON.stringify(exportData.filters);
        axios.post('/request/export', exportData, {
            responseType: 'blob', // Important for downloading files
        })
        .then((response) => {
            const contentDisposition = response.headers['content-disposition'];
            const fileName = contentDisposition
                ? contentDisposition.split('filename=')[1].replace(/['"]/g, '')
                : 'exported_file';
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName); // Correct filename
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsModalOpen(false);
        })
        .catch((error) => {
            console.error('Export failed', error);
        });
    }

    return (
        <>
            <Head title="Privileges"/>
            <ContentPanel>
                <TopPanel>
                    <div className="inline-flex gap-1">
                        
                        <IconTooltipButton
                            label="Refresh data"
                            isDark={isDark}
                            placement="bottom"
                            className={`${textColorActive} overflow-hidden border border-[1px] border-gray-500 rounded-md font-poppins text-sm px-2 py-2 hover:opacity-80 ${['bg-skin-white'].includes(theme) ? whiteBgCoror : theme} py-[5px] px-[10px]`}
                            onClick={refreshTable}
                        >
                            <i className='fa fa-table text-[18px] mt-[3px]'></i>
                        </IconTooltipButton>
                        <Button
                            href="privileges/create-privileges"
                            extendClass={(['bg-skin-white'].includes(theme) ? whiteBgCoror : theme)+" py-[5px] px-[10px]"}
                            fontColor={textColorActive}
                            onClick={() => setIsModalOpen(true)}
                        >
                            <i className='fa fa-download'></i> Export
                        </Button>
                        <Button
                            href="privileges/create-privileges"
                            extendClass={(['bg-skin-white'].includes(theme) ? whiteBgCoror : theme)+" py-[5px] px-[10px]"}
                            type="link"
                            fontColor={textColorActive}
                        >
                            <i className="fa fa-plus-circle mt-[6px]"></i> Add
                            Privilege
                        </Button>
                    </div>
                    <div className='flex'>
                        <Filters onSubmit={handleFilterSubmit}>
                            <FilterFields
                                filterData={filterData}
                                filters={filters}
                                handleType={handleType}
                                handleDateChange={handleDateChange}
                                handleFilter={handleFilter}
                                handleSorting={handleSorting}
                                formatLabel={formatLabel}
                                filterSearchOptions={FilterSearchOptions}
                            />
                        </Filters>
                        <TableSearch queryParams={queryParams} />
                    </div>
                </TopPanel>
                <TableContainer data={privileges?.data}>
                    <Thead>
                        <Row>
                            <TableHeader
                                name="id"
                                queryParams={queryParams}
                                width="sm"
                            >
                                ID
                            </TableHeader>
                            <TableHeader
                                name="name"
                                queryParams={queryParams}
                                width="sm"
                            >
                                Name
                            </TableHeader>
                            <TableHeader
                                name="is_admin"
                                queryParams={queryParams}
                                width="sm"
                            >
                                Account Type
                            </TableHeader>
                            <TableHeader
                                name="is_superadmin"
                                queryParams={queryParams}
                                width="sm"
                            >
                                Super Admin
                            </TableHeader>
                            <TableHeader
                                sortable={false}
                                width="auto"
                                justify="center"
                            >
                                Action
                            </TableHeader>
                        </Row>
                    </Thead>
                    <Tbody data={privileges?.data}>
                        {privileges &&
                            privileges?.data.map((item, index) => (
                                <Row key={item.id}>
                                    <RowData isLoading={loading}>
                                        {item.id}
                                    </RowData>
                                    <RowData isLoading={loading}>
                                        {item.name}
                                    </RowData>
                                    <RowData isLoading={loading}>
                                        {item.is_admin ? "Administrator" : "Trader"}
                                    </RowData>
                                    <RowData isLoading={loading}>
                                        {item.is_superadmin
                                            ? "Superadmin"
                                            : "Standard"}
                                    </RowData>
                                    <RowData center>
                                        <RowAction
                                            as="button"
                                            action="edit"
                                            href={`privileges/edit-privileges/${item.id}`}
                                        />
                                        <RowAction
                                            as="button"
                                            action="view"
                                            href={`privileges/edit-privileges/${item.id}`}
                                        />
                                    </RowData>
                                </Row>
                            ))}
                    </Tbody>
                </TableContainer>
                <Pagination extendClass={theme} paginate={privileges} />
                <ExportDataModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    moduleName={auth.module[0].name}
                    settings={settings}
                    theme={theme === 'bg-skin-white' ? whiteBgCoror : theme}
                    fontColor={textColorActive}
                    onClick={handleExport}
                    filters={queryParams} 
                />
            </ContentPanel>
        </>
    );
};

export default Privileges;
