import React, { useEffect, useState } from 'react';
import { Head, Link, router, usePage, useForm } from "@inertiajs/react";
import InputComponent from '../../Components/Forms/Input';
import TableContainer from '../../Components/Table/TableContainer';
import Thead from '../../Components/Table/Thead';
import Row from '../../Components/Table/Row';
import TableHeader from '../../Components/Table/TableHeader';
import Tbody from '../../Components/Table/Tbody';
import RowData from '../../Components/Table/RowData';
import RowAction from '../../Components/Table/RowAction';
import TopPanel from '../../Components/Table/TopPanel';
import Button from '../../Components/Table/Buttons/Button';
import TableSearch from '../../Components/Table/TableSearch';
import { IconTooltipButton } from '../../Components/Tooltip/AnchoredTooltip';
import { useTheme } from '../../Context/ThemeContext';
import useThemeStyles from '../../Hooks/useThemeStyles';
import RowStatus from '../../Components/Table/RowStatus';
import Checkbox from '../../Components/Checkbox/Checkbox';
import BulkActions from '../../Components/Table/Buttons/BulkActions';
import { useToast } from '../../Context/ToastContext';
const ApiDocumentation = ({api, queryParams}) => {
    const { theme } = useTheme();
    const isDark = theme === 'bg-skin-black';
    const { textColorActive } = useThemeStyles(theme);
    const { handleToast } = useToast();
    const [pathname, setPathname] = useState(null);
    
    const baseUrl = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ":" + window.location.port : "" + "/api");
    

    useEffect(() => {
        const segments = window.location.pathname.split("/");
        setPathname(segments.pop());
    }, []);
    
    const refreshTable = (e) => {
        e.preventDefault();
        router.get(pathname);
    };

     // BULK ACTION
    
        const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
    
        const { data, setData, processing, reset, post, errors } = useForm({
            selectedIds: [],
            bulkAction: "",
        });
    
        const handleSelectAll = () => {
            if (isSelectAllChecked) {
                setData("selectedIds", []);
            } else {
                setData(
                    "selectedIds",
                    api.data.map((item) => item.id)
                );
            }
            setIsSelectAllChecked(!isSelectAllChecked);
        };
    
        const handleRowSelection = (id) => {
            setData((prevData) => {
                const selectedIds = prevData.selectedIds || [];
                let updatedSelectedIds;
    
                if (selectedIds.includes(id)) {
                    updatedSelectedIds = selectedIds.filter((item) => item !== id);
                } else {
                    updatedSelectedIds = [...selectedIds, id];
                }
    
                if (
                    updatedSelectedIds.length === api.data.length
                ) {
                    setIsSelectAllChecked(true);
                } else {
                    setIsSelectAllChecked(false);
                }
    
                return { ...prevData, selectedIds: updatedSelectedIds };
            });
        };
    
        const handleBulkAction = () => {
            if (data.selectedIds.length === 0) {
                handleToast("No Data Selected", "error");
                return;
            }
            post("api_generator/bulk_action", {
                onSuccess: (data) => {
                    const { message, type } = data.props.auth.sessions;
                    handleToast(message, type);
                    reset();
                },
                onError: (error) => {},
            });
    
            setData("selectedIds", []);
            setIsSelectAllChecked(false);
        };

    return (
        <div className='space-y-3 p-3'>
           <InputComponent
                displayName="API BASE URL" 
                value={baseUrl}
                disabled
            />  
            <TopPanel>
                <div className="inline-flex flex-wrap gap-1">
                    <BulkActions
                        setData={setData}
                        onConfirm={handleBulkAction}
                        itemName="API/s"
                    />
                    <IconTooltipButton
                        label="Refresh data"
                        isDark={isDark}
                        placement="bottom"
                        className={`${textColorActive} overflow-hidden border border-[1px] border-gray-500 rounded-md font-poppins text-sm px-2 py-2 hover:opacity-80 ${
                            ["bg-skin-white"].includes(theme)
                                ? primayActiveColor
                                : theme
                        } py-[5px] px-[10px]`}
                        onClick={refreshTable}
                    >
                        <i className="fa fa-rotate-right text-base p-[1px]"></i>
                    </IconTooltipButton>
                    <Button
                        extendClass={
                            (["bg-skin-white"].includes(theme)
                                ? primayActiveColor
                                : theme) + " py-[5px] px-[10px]"
                        }
                        type="link"
                        fontColor={textColorActive}
                        href="api_generator/create_api_view"
                    >
                        <i className="fa-solid fa-plus mr-1"></i>{" "}
                        Create/Generate API
                    </Button>
                </div>
                <div className="flex">
                    <TableSearch queryParams={queryParams} />
                </div>
            </TopPanel>
            <TableContainer data={api?.data}>
                <Thead>
                    <Row>
                        <TableHeader
                            name="id"
                            width="sm"
                            sortable={false}
                            justify="center"
                        >
                            <Checkbox
                                handleClick={handleSelectAll}
                                isChecked={isSelectAllChecked}
                                disabled={false}
                            />
                        </TableHeader>
                        <TableHeader
                            sortable={false}
                            width="md"
                            justify="center"
                        >
                            Action
                        </TableHeader>
                        <TableHeader
                            name="status"
                            queryParams={queryParams}
                            width="sm"
                        >
                            Status
                        </TableHeader>
                        <TableHeader
                            name="id"
                            queryParams={queryParams}
                            sortable={true}
                            width="sm"
                        >
                            No.
                        </TableHeader>
                        <TableHeader
                            name="api_name"
                            queryParams={queryParams}
                            sortable={true}
                            width="lg"
                        >
                            API Name
                        </TableHeader>
                        <TableHeader
                            name="method"
                            queryParams={queryParams}
                            sortable={true}
                            width="lg"
                        >
                            API Method
                        </TableHeader>
                        <TableHeader
                            name="endpoint"
                            queryParams={queryParams}
                            sortable={true}
                            width="lg"
                        >
                            API End Point
                        </TableHeader>
                      
                    </Row>
                </Thead>
                <Tbody data={api.data}>
                    {api &&
                        api?.data.map((item, index) => (
                            <Row key={index + item.name}>
                                <RowData center>
                                    <Checkbox
                                        handleClick={() =>
                                            handleRowSelection(
                                                item.id
                                            )
                                        }
                                        isChecked={data.selectedIds.includes(
                                            item.id
                                        )}
                                        disabled={false}
                                    />
                                </RowData>
                                <RowData center>
                                    <RowAction
                                        type="link"
                                        action="view"
                                        href={`/api_generator/view/${item.id}`}
                                    />
                                    <RowAction
                                        type="link"
                                        action="edit"
                                        href={`/api_generator/edit/${item.id}`}
                                    />
                                </RowData>
                                <RowStatus
                                    systemStatus={
                                        item.status === 1
                                            ? "active"
                                            : "inactive"
                                    }
                                >
                                    {item.status === 1
                                        ? "ACTIVE"
                                        : "INACTIVE"}
                                </RowStatus>
                                <RowData>
                                    {item.id}
                                </RowData>
                                <RowData>
                                    {item.name}
                                </RowData>
                                <RowData>
                                    {item.method}
                                </RowData>
                                <RowData>
                                    {item.endpoint}
                                </RowData>
                                
                                
                            </Row>
                    ))}
                </Tbody>
            </TableContainer>
            
        </div>
    );
};

export default ApiDocumentation;
