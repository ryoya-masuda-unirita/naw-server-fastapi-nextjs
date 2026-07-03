/**
 * User Form Component - Create/Edit user
 */
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './user-form.component.html',
})
export class UserFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  firstName = '';
  lastName = '';
  email = '';
  role = 'user';
  status = 'active';
  password = '';
  bio = '';

  isLoading = signal(false);
  isEditMode = signal(false);

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEditMode.set(true);
      // Load user data - mock for now
      this.firstName = 'John';
      this.lastName = 'Doe';
      this.email = 'john@example.com';
      this.role = 'admin';
      this.status = 'active';
    }
  }

  async onSubmit() {
    this.isLoading.set(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    this.isLoading.set(false);
    this.router.navigate(['/admin/users']);
  }
}
