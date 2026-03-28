import requests
import sys

BASE_URL = "http://127.0.0.1:8000"

print("--- Testing Intern Tracking System API ---")

# 1. Register Admin
print("\n1. Registering Admin...")
admin_data = {
    "name": "Admin User",
    "email": "admin@test.com",
    "password": "password123",
    "role": "admin",
    "department": "HR"
}
res = requests.post(f"{BASE_URL}/auth/register", json=admin_data)
print(f"Status: {res.status_code}, Response: {res.text}")

# 2. Login Admin
print("\n2. Logging in as Admin...")
login_data = {"username": "admin@test.com", "password": "password123"}
res = requests.post(f"{BASE_URL}/auth/login", data=login_data)
print(f"Status: {res.status_code}")
if res.status_code != 200:
    print("Login failed, aborting tests.")
    sys.exit(1)
token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 3. Get Current User (Me)
print("\n3. Getting Current User Info (/auth/me)...")
res = requests.get(f"{BASE_URL}/auth/me", headers=headers)
print(f"Status: {res.status_code}, Response: {res.text}")
admin_id = res.json()["id"]

# 4. Create Intern
print("\n4. Creating Intern...")
intern_data = {
    "name": "Intern User",
    "email": "intern@test.com",
    "password": "password123",
    "role": "intern",
    "department": "Engineering"
}
res = requests.post(f"{BASE_URL}/interns/", json=intern_data, headers=headers)
print(f"Status: {res.status_code}, Response: {res.text}")
if res.status_code in (200, 201):
    intern_id = res.json()["id"]
else:
    # If already exists, fetch the list
    res_list = requests.get(f"{BASE_URL}/interns/", headers=headers)
    for intern in res_list.json():
        if intern["email"] == "intern@test.com":
            intern_id = intern["id"]
            break

# 5. List Interns
print("\n5. Listing Interns...")
res = requests.get(f"{BASE_URL}/interns/", headers=headers)
print(f"Status: {res.status_code}, Count: {len(res.json())}")

# 6. Create Task
print("\n6. Creating Task...")
task_data = {
    "title": "Setup Environment",
    "description": "Install Python and VSCode",
    "assigned_to": intern_id,
    "deadline": "2026-12-31T23:59:59"
}
res = requests.post(f"{BASE_URL}/tasks/", json=task_data, headers=headers)
print(f"Status: {res.status_code}, Response: {res.text}")

# 7. List Tasks
print("\n7. Listing Tasks...")
res = requests.get(f"{BASE_URL}/tasks/", headers=headers)
print(f"Status: {res.status_code}, Count: {len(res.json())}")

# 8. Mark Attendance
print("\n8. Marking Attendance...")
att_data = {
    "user_id": intern_id,
    "date": "2026-03-25",
    "status": "present"
}
res = requests.post(f"{BASE_URL}/attendance/", json=att_data, headers=headers)
print(f"Status: {res.status_code}, Response: {res.text}")

# 9. Get Reports
print("\n9. Getting Reports (/reports/summary)...")
res = requests.get(f"{BASE_URL}/reports/summary", headers=headers)
print(f"Status: {res.status_code}, Response: {res.text}")

print("\n--- All Tests Finished ---")
