const handleAddUser = async () => {
    if (!newUserForm.username || !newUserForm.password) return alert("Username and Password required");
    if (newUserForm.password !== newUserForm.confirm) return alert("Passwords do not match");

    try {
