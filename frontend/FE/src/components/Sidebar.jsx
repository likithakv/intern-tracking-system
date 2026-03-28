import React from 'react';

const Sidebar = () => {
    return (
        <aside className="sidebar">
            <ul>
                <li><a href="/">Dashboard</a></li>
                <li><a href="/interns">Interns</a></li>
                <li><a href="/tasks">Tasks</a></li>
                <li><a href="/attendance">Attendance</a></li>
                <li><a href="/reports">Reports</a></li>
                <li><a href="/settings">Settings</a></li>
            </ul>
        </aside>
    );
};

export default Sidebar;
