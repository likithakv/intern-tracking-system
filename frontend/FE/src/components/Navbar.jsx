import React from 'react';

const Navbar = () => {
    return (
        <nav className="navbar">
            <div className="navbar-logo">InternTrack</div>
            <div className="navbar-links">
                <a href="/dashboard">Dashboard</a>
                <a href="/login">Logout</a>
            </div>
        </nav>
    );
};

export default Navbar;
