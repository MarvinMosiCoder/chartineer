import { router, Head, usePage } from '@inertiajs/react';
import React, { useEffect, useState } from 'react';
import Modal from '../../Components/Modal/Modal';
import axios from 'axios';
import RowData from '../../Components/Table/RowData';
import TableContainer from '../../Components/Table/TableContainer';
import TopPanel from '../../Components/Table/TopPanel';
import TableSearch from '../../Components/Table/TableSearch';
import Filters from '../../Components/Table/Buttons/Filters';
import ContentPanel from '../../Components/Table/ContentPanel';
import Thead from '../../Components/Table/Thead';
import Row from '../../Components/Table/Row';
import TableHeader from '../../Components/Table/TableHeader';
import Pagination from '../../Components/Table/Pagination';
import RowActions from '../../Components/Table/RowActions';
import RowAction from '../../Components/Table/RowAction';
import TableButton from '../../Components/Table/Buttons/TableButton';
import Checkbox from '../../Components/Checkbox/Checkbox';
import RowStatus from '../../Components/Table/RowStatus';
import BulkActions from '../../Components/Table/Buttons/BulkActions';
import Tbody from '../../Components/Table/Tbody';
import { useToast } from '../../Context/ToastContext';
import { useTheme } from '../../Context/ThemeContext';
import useSwalColor from "../../Hooks/useThemeSwalColor";
import UsersForm from './UsersForm';
import useThemeStyles from '../../Hooks/useThemeStyles';
import useFilters from '../../Hooks/useFilters';
import Button from '../../Components/Table/Buttons/Button';
import FilterFields from '../../Components/Table/Buttons/FilterFields';
import FilterSearchOptions from '../../Components/Table/FilterSearchOptions';
import ExportDataModal from '../../Components/Modal/ExportDataModel';
import { IconTooltipButton } from '../../Components/Tooltip/AnchoredTooltip';

const Users = ({ tableName, users, options, queryParams }) => {
    const { auth } = usePage().props;
    const {theme} = useTheme();
    const isDark = theme === 'bg-skin-black';
    const swalColor = useSwalColor(theme);
    queryParams = queryParams || {};
    const { handleToast } = useToast();
    router.on('start', () => setLoading(true));
    router.on('finish', () => setLoading(false));
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [isCheckAll, setIsCheckAll] = useState(false);
    const [isCheck, setIsCheck] = useState([]);
    const { textColorActive, whiteBgCoror } = useThemeStyles(theme);
    const [filterData, setFilterData] = useState([]);
    const [pathname, setPathname] = useState(null);
    const { filters, handleFilter, handleFilterSubmit, handleSorting, handleType, handleDateChange } = useFilters(pathname);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const segments = window.location.pathname.split("/");
        setPathname(segments.pop());
    }, []);

    useEffect(() => {
        axios
            .get('/filter/users')
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

    //BULK ACTIONS
    const handleSelectAll = () => {
        setIsCheckAll(!isCheckAll);
        setIsCheck(users.data.map((item) => item.u_id));
        if (isCheckAll) {
            setIsCheck([]);
        }
    };

    const handleClick = (e) => {
        const { id, checked } = e.target;
        setIsCheck([...isCheck, parseInt(id)]);
        if (!checked) {
            setIsCheck(isCheck.filter((item) => item !== parseInt(id)));
        }
    };

    const handleActionClick = async (value) => {
        const bulk_action_type = value;
        const Ids = Array.from(
            document.querySelectorAll('input[name="users_id[]"]:checked')
        ).map((input) => parseInt(input.id));
        if (Ids.length === 0) {
            handleToast('Nothing selected!', 'Error');
        } else {
            Swal.fire({
                title: `<p class="font-poppins" >Set to ${
                    !bulk_action_type == 0 ? "Active" : "Inactive"
                }?</p>`,
                showCancelButton: true,
                confirmButtonText: 'Confirm',
                confirmButtonColor: swalColor,
                icon: 'question',
                iconColor: swalColor,
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        const response = await axios.post(
                            '/deactivate-users',
                            { Ids, bulk_action_type },
                            {
                                headers: {
                                    'Content-Type': 'multipart/form-data',
                                },
                            }
                        );
                        if (response.data.status == 'success') {
                            handleToast(
                                response.data.message,
                                response.data.status
                            );
                            router.reload({ only: ['users'] });
                            setIsCheck([]);
                            setIsCheckAll(false);
                        }
                    } catch (error) {}
                }
            });
        }
    };

    // CREATE USERS
    const handleCreate = () => {
        setShowCreateModal(true);
    };
    const handleCloseCreateModal = (e,action) => {
        setShowCreateModal(false);
        if(action !== 'close'){
            router.reload({ only: ['users'] });
        }
    };
    
    //EDIT
    const handleEdit = (user) => {
        setEditUser(user);
        setShowEditModal(true);
    };
    const handleCloseEditModal = (e,action) => {
        setShowEditModal(false);
        if(action !== 'close'){
            router.reload({ only: ['users'] });
        }
    };

    const bulkActions = [
        {
            label: (
                <span>
                    <i className="fa fa-check-circle mr-2 text-green-600"></i>{" "}
                    SET ACTIVE
                </span>
            ),
            value: 1,
        },
        {
            label: (
                <span>
                    <i className="fa fa-times-circle mr-2 text-red-600"></i> SET INACTIVE
                </span>
            ),
            value: 0,
        },
    ];

    const settings = {
        default_paper_size: "Letter",
    };

    const handleExport = (exportData) => {
        exportData.table_name = tableName;
        exportData.filters = JSON.stringify(exportData.filters);
        exportData.columns = Object.keys(filterData[0]);
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
            <Head title="Users Management" />
                <ContentPanel>
                    <TopPanel>
                        <div className="inline-flex gap-1">
                            <BulkActions
                                actions={bulkActions}
                                onActionSelected={handleActionClick}
                                btnColor='bg-gray-100'
                                fontColor='text-stone-900'
                            />
                            <IconTooltipButton
                                label="Refresh table"
                                isDark={isDark}
                                placement="bottom"
                                className={`${textColorActive} overflow-hidden border border-[1px] border-gray-500 rounded-md font-poppins text-sm px-2 py-2 hover:opacity-80 ${theme === 'bg-skin-white' ? whiteBgCoror : theme} py-[5px] px-[10px]`}
                                onClick={refreshTable}
                            >
                                <i className='fa fa-table text-[18px] mt-1'></i>
                            </IconTooltipButton>
                            <Button
                                href="privileges/create-privileges"
                                extendClass={(theme === 'bg-skin-white' ? whiteBgCoror : theme)+" py-[5px] px-[10px]"}
                                fontColor={textColorActive}
                                onClick={() => setIsModalOpen(true)}
                            >
                                <i className='fa fa-download'></i> Export
                            </Button>
                            <TableButton extendClass={theme === 'bg-skin-white' ? whiteBgCoror : theme+ ' py-[5px] px-[10px]'} fontColor={textColorActive} onClick={handleCreate}>
                                <i className="fa fa-plus-circle"></i> Add User
                            </TableButton>
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

                    <TableContainer data={users?.data}>
                        <Thead>
                            <Row>
                                <TableHeader
                                    name="users_id"
                                    width="xm"
                                    sortable={false}
                                    justify="center"
                                >
                                    <Checkbox
                                        type="checkbox"
                                        name="selectAll"
                                        id="selectAll"
                                        handleClick={handleSelectAll}
                                        isChecked={isCheckAll}
                                    />
                                </TableHeader>

                                <TableHeader
                                    name="user_name"
                                    queryParams={queryParams}
                                    width="sm"
                                >
                                    Name
                                </TableHeader>

                                <TableHeader
                                    name="email"
                                    queryParams={queryParams}
                                >
                                    Email
                                </TableHeader>

                                <TableHeader
                                    name="privilege_name"
                                    queryParams={queryParams}
                                    width="sm"
                                >
                                    Privilege Name
                                </TableHeader>
                                <TableHeader
                                    name="status"
                                    queryParams={queryParams}
                                    width="sm"
                                >
                                    Status
                                </TableHeader>

                                <TableHeader
                                    sortable={false}
                                    width="auto"z
                                    justify="center"
                                >
                                    Action
                                </TableHeader>
                            </Row>
                        </Thead>

                        <Tbody data={users?.data}>
                            {users &&
                                users?.data.map((user, index) => (
                                    <Row
                                        key={user.user_name + user.u_id + index}
                                    >
                                        <RowData center>
                                            <Checkbox
                                                type="checkbox"
                                                name="users_id[]"
                                                id={user.u_id}
                                                handleClick={handleClick}
                                                isChecked={isCheck.includes(
                                                    user.u_id
                                                )}
                                            />
                                        </RowData>
                                        <RowData isLoading={loading}>
                                            {user.name}
                                        </RowData>
                                        <RowData isLoading={loading}>
                                            {user.email}
                                        </RowData>
                                        <RowData isLoading={loading}>
                                            {user.role.name}
                                        </RowData>
                                        <RowStatus
                                            isLoading={loading}
                                            systemStatus={
                                                user.status === "ACTIVE"
                                                    ? "active"
                                                    : "inactive"
                                            }
                                        >
                                            {user.status === "ACTIVE"
                                                ? "ACTIVE"
                                                : "INACTIVE"}
                                        </RowStatus>
                                        <RowData
                                            isLoading={loading}
                                            width="sm"
                                            center
                                        >
                                            <RowActions>
                                                <RowAction
                                                    type="button"
                                                    action="edit"
                                                    onClick={() =>
                                                        handleEdit(user)
                                                    }
                                                />
                                            </RowActions>
                                        </RowData>
                                    </Row>
                                ))}
                        </Tbody>
                    </TableContainer>
                    <div
                        onClick={() => {
                            setIsCheckAll(false), setIsCheck([]);
                        }}
                    >
                        <Pagination extendClass={theme} paginate={users} />
                    </div>
                </ContentPanel>
                
                <Modal
                    theme={theme}
                    show={showCreateModal}
                    onClose={handleCloseCreateModal}
                    title="Create User"
                    width="lg"
                    fontColor={textColorActive}
                    icon='fa fa-file-text'
                    btnIcon='fa fa-refresh'
                >
                    <UsersForm 
                        options={options} 
                        onClose={handleCloseCreateModal} 
                        action="create"
                    />
                </Modal>

                <Modal
                    theme={theme}
                    show={showEditModal}
                    onClose={handleCloseEditModal}
                    title="Edit User"
                    width="lg"
                    fontColor={textColorActive}
                    icon='fa fa-edit'
                    btnIcon='fa fa-edit'
                >
                    <UsersForm
                        options={options}
                        action="edit"
                        user={editUser}
                        onClose={handleCloseEditModal}
                    />
                </Modal>
                <ExportDataModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    moduleName={auth.module[0].name}
                    settings={settings}
                    theme={theme}
                    fontColor={textColorActive}
                    onClick={handleExport}
                    filters={queryParams} 
                />
        </>
    );
};

export default Users;
