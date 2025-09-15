import random
import numpy as np
from typing import List, Dict, Tuple
import time
from .models import (
    Course, Faculty, Room, Student, TimetableSlot, 
    OptimizationRequest, OptimizationResult, TimeSlot
)

class GeneticTimetableSolver:
    """
    Genetic Algorithm solver for multi-objective timetable optimization
    Handles complex scenarios with multiple conflicting objectives
    """
    
    def __init__(self, population_size=100, generations=500, mutation_rate=0.1, crossover_rate=0.8):
        self.population_size = population_size
        self.generations = generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        
    def solve_timetable(self, request: OptimizationRequest) -> OptimizationResult:
        """
        Main genetic algorithm solving method
        """
        start_time = time.time()
        
        try:
            # Prepare data structures
            courses = {c.id: c for c in request.courses}
            faculty = {f.id: f for f in request.faculty}
            rooms = {r.id: r for r in request.rooms}
            students = {s.id: s for s in request.students}
            time_slots = request.time_slots
            
            # Initialize population
            population = self._initialize_population(courses, faculty, rooms, time_slots)
            
            best_fitness = -float('inf')
            best_individual = None
            generation_without_improvement = 0
            
            # Evolution loop
            for generation in range(self.generations):
                # Evaluate fitness for all individuals
                fitness_scores = [self._evaluate_fitness(individual, request) for individual in population]
                
                # Track best solution
                max_fitness_idx = np.argmax(fitness_scores)
                if fitness_scores[max_fitness_idx] > best_fitness:
                    best_fitness = fitness_scores[max_fitness_idx]
                    best_individual = population[max_fitness_idx].copy()
                    generation_without_improvement = 0
                else:
                    generation_without_improvement += 1
                
                # Early termination if no improvement
                if generation_without_improvement > 50:
                    break
                
                # Selection, crossover, and mutation
                new_population = []
                
                # Elitism: keep best 10% of population
                elite_count = max(1, self.population_size // 10)
                elite_indices = np.argsort(fitness_scores)[-elite_count:]
                for idx in elite_indices:
                    new_population.append(population[idx].copy())
                
                # Generate rest of population through crossover and mutation
                while len(new_population) < self.population_size:
                    parent1 = self._tournament_selection(population, fitness_scores)
                    parent2 = self._tournament_selection(population, fitness_scores)
                    
                    if random.random() < self.crossover_rate:
                        child1, child2 = self._crossover(parent1, parent2)
                    else:
                        child1, child2 = parent1.copy(), parent2.copy()
                    
                    if random.random() < self.mutation_rate:
                        child1 = self._mutate(child1, courses, faculty, rooms, time_slots)
                    if random.random() < self.mutation_rate:
                        child2 = self._mutate(child2, courses, faculty, rooms, time_slots)
                    
                    new_population.extend([child1, child2])
                
                population = new_population[:self.population_size]
            
            execution_time = time.time() - start_time
            
            if best_individual is not None:
                # Convert best individual to timetable slots
                timetable_slots = self._individual_to_slots(best_individual, courses, faculty, rooms, time_slots)
                conflicts = self._detect_conflicts(timetable_slots, request)
                
                # Calculate metrics
                optimization_score = best_fitness
                faculty_workload = self._calculate_faculty_workload(timetable_slots, faculty)
                room_utilization = self._calculate_room_utilization(timetable_slots, rooms, time_slots)
                
                return OptimizationResult(
                    success=True,
                    timetable_slots=timetable_slots,
                    conflicts=conflicts,
                    optimization_score=optimization_score,
                    faculty_workload=faculty_workload,
                    room_utilization=room_utilization,
                    execution_time=execution_time,
                    algorithm_used="Genetic Algorithm"
                )
            else:
                return OptimizationResult(
                    success=False,
                    warnings=["No feasible solution found through genetic algorithm"],
                    execution_time=execution_time,
                    algorithm_used="Genetic Algorithm"
                )
                
        except Exception as e:
            return OptimizationResult(
                success=False,
                warnings=[f"Genetic algorithm error: {str(e)}"],
                execution_time=time.time() - start_time,
                algorithm_used="Genetic Algorithm"
            )
    
    def _initialize_population(self, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List[TimeSlot]) -> List[List]:
        """
        Initialize random population of timetable assignments
        Each individual is represented as a list of assignments: [(course_id, faculty_id, room_id, time_slot_idx)]
        """
        population = []
        
        for _ in range(self.population_size):
            individual = []
            
            for course_id, course in courses.items():
                # Each course needs 'credits' number of slots
                for _ in range(course.credits):
                    # Random assignment
                    faculty_id = random.choice(list(faculty.keys()))
                    room_id = random.choice(list(rooms.keys()))
                    time_slot_idx = random.randint(0, len(time_slots) - 1)
                    
                    individual.append((course_id, faculty_id, room_id, time_slot_idx))
            
            population.append(individual)
        
        return population
    
    def _evaluate_fitness(self, individual: List[Tuple], request: OptimizationRequest) -> float:
        """
        Multi-objective fitness function
        Higher score means better solution
        """
        if not individual:
            return 0.0
        
        # Convert individual to slots for analysis
        courses = {c.id: c for c in request.courses}
        faculty = {f.id: f for f in request.faculty}
        rooms = {r.id: r for r in request.rooms}
        time_slots = request.time_slots
        
        timetable_slots = self._individual_to_slots(individual, courses, faculty, rooms, time_slots)
        
        # Multi-objective fitness components
        conflict_score = self._calculate_conflict_score(timetable_slots)
        workload_score = self._calculate_workload_balance_score(timetable_slots, faculty)
        utilization_score = self._calculate_utilization_score(timetable_slots, rooms, time_slots)
        constraint_score = self._calculate_constraint_satisfaction_score(timetable_slots, request)
        
        # Weighted combination of objectives
        fitness = (
            0.4 * conflict_score +      # 40% weight on minimizing conflicts
            0.25 * workload_score +     # 25% weight on workload balance
            0.2 * utilization_score +   # 20% weight on room utilization
            0.15 * constraint_score     # 15% weight on constraint satisfaction
        )
        
        return fitness
    
    def _calculate_conflict_score(self, timetable_slots: List[TimetableSlot]) -> float:
        """Calculate score based on conflicts (higher = fewer conflicts)"""
        conflicts = 0
        
        # Faculty conflicts
        faculty_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.faculty_id}_{slot.day}_{slot.start_time}"
            if key in faculty_schedule:
                conflicts += 1
            else:
                faculty_schedule[key] = slot
        
        # Room conflicts
        room_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.room_id}_{slot.day}_{slot.start_time}"
            if key in room_schedule:
                conflicts += 1
            else:
                room_schedule[key] = slot
        
        # Convert to score (fewer conflicts = higher score)
        total_slots = len(timetable_slots)
        if total_slots == 0:
            return 0.0
        
        conflict_rate = conflicts / total_slots
        return max(0, 100 * (1 - conflict_rate))
    
    def _calculate_workload_balance_score(self, timetable_slots: List[TimetableSlot], faculty: Dict) -> float:
        """Calculate score based on workload balance (higher = more balanced)"""
        if not faculty:
            return 100.0
        
        # Calculate workload for each faculty
        workload = {fid: 0 for fid in faculty.keys()}
        for slot in timetable_slots:
            if slot.faculty_id in workload:
                workload[slot.faculty_id] += slot.duration // 60
        
        workload_values = list(workload.values())
        if not workload_values or max(workload_values) == 0:
            return 100.0
        
        # Calculate coefficient of variation (lower = more balanced)
        mean_workload = np.mean(workload_values)
        std_workload = np.std(workload_values)
        
        if mean_workload == 0:
            return 100.0
        
        cv = std_workload / mean_workload
        return max(0, 100 * (1 - cv))
    
    def _calculate_utilization_score(self, timetable_slots: List[TimetableSlot], rooms: Dict, time_slots: List) -> float:
        """Calculate score based on room utilization"""
        if not rooms or not time_slots:
            return 100.0
        
        total_possible_slots = len(rooms) * len(time_slots) * 5  # 5 days
        utilized_slots = len(timetable_slots)
        
        utilization_rate = utilized_slots / total_possible_slots if total_possible_slots > 0 else 0
        
        # Optimal utilization is around 70-80%
        optimal_rate = 0.75
        deviation = abs(utilization_rate - optimal_rate)
        return max(0, 100 * (1 - deviation))
    
    def _calculate_constraint_satisfaction_score(self, timetable_slots: List[TimetableSlot], request: OptimizationRequest) -> float:
        """Calculate score based on constraint satisfaction"""
        score = 100.0
        
        # Check faculty workload constraints
        faculty = {f.id: f for f in request.faculty}
        faculty_workload = self._calculate_faculty_workload(timetable_slots, faculty)
        
        for faculty_id, workload in faculty_workload.items():
            if faculty_id in faculty:
                max_hours = faculty[faculty_id].max_hours_per_week
                if workload > max_hours:
                    score -= 10  # Penalty for exceeding max hours
        
        # Check room capacity constraints
        rooms = {r.id: r for r in request.rooms}
        courses = {c.id: c for c in request.courses}
        
        for slot in timetable_slots:
            if slot.room_id in rooms and slot.course_id in courses:
                room_capacity = rooms[slot.room_id].capacity
                expected_students = courses[slot.course_id].expected_students
                if expected_students > room_capacity:
                    score -= 5  # Penalty for capacity overflow
        
        return max(0, score)
    
    def _tournament_selection(self, population: List, fitness_scores: List[float], tournament_size=3) -> List:
        """Tournament selection for parent selection"""
        tournament_indices = random.sample(range(len(population)), min(tournament_size, len(population)))
        tournament_fitness = [fitness_scores[i] for i in tournament_indices]
        winner_idx = tournament_indices[np.argmax(tournament_fitness)]
        return population[winner_idx].copy()
    
    def _crossover(self, parent1: List, parent2: List) -> Tuple[List, List]:
        """Single-point crossover"""
        if len(parent1) != len(parent2) or len(parent1) == 0:
            return parent1.copy(), parent2.copy()
        
        crossover_point = random.randint(1, len(parent1) - 1)
        
        child1 = parent1[:crossover_point] + parent2[crossover_point:]
        child2 = parent2[:crossover_point] + parent1[crossover_point:]
        
        return child1, child2
    
    def _mutate(self, individual: List, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List) -> List:
        """Random mutation of assignments"""
        if not individual:
            return individual
        
        mutated = individual.copy()
        
        # Mutate random assignments
        num_mutations = max(1, int(len(individual) * self.mutation_rate))
        
        for _ in range(num_mutations):
            if mutated:
                idx = random.randint(0, len(mutated) - 1)
                course_id, _, _, _ = mutated[idx]
                
                # Generate new random assignment
                new_faculty_id = random.choice(list(faculty.keys()))
                new_room_id = random.choice(list(rooms.keys()))
                new_time_slot_idx = random.randint(0, len(time_slots) - 1)
                
                mutated[idx] = (course_id, new_faculty_id, new_room_id, new_time_slot_idx)
        
        return mutated
    
    def _individual_to_slots(self, individual: List, courses: Dict, faculty: Dict, rooms: Dict, time_slots: List) -> List[TimetableSlot]:
        """Convert genetic algorithm individual to timetable slots"""
        slots = []
        
        for course_id, faculty_id, room_id, time_slot_idx in individual:
            if time_slot_idx < len(time_slots):
                time_slot = time_slots[time_slot_idx]
                slot = TimetableSlot(
                    course_id=course_id,
                    faculty_id=faculty_id,
                    room_id=room_id,
                    day=time_slot.day,
                    start_time=time_slot.start_time,
                    end_time=time_slot.end_time,
                    duration=time_slot.duration,
                    student_ids=[]
                )
                slots.append(slot)
        
        return slots
    
    def _detect_conflicts(self, timetable_slots: List[TimetableSlot], request: OptimizationRequest) -> List[Dict]:
        """Detect conflicts in the timetable"""
        conflicts = []
        
        # Faculty conflicts
        faculty_schedule = {}
        for slot in timetable_slots:
            key = f"{slot.faculty_id}_{slot.day}_{slot.start_time}"
            if key in faculty_schedule:
                conflicts.append({
                    "type": "faculty_clash",
                    "description": f"Faculty {slot.faculty_id} has overlapping assignments",
                    "affected_slots": [faculty_schedule[key].dict(), slot.dict()],
                    "severity": "high"
                })
            else:
                faculty_schedule[key] = slot
        
        return conflicts
    
    def _calculate_faculty_workload(self, timetable_slots: List[TimetableSlot], faculty: Dict) -> Dict[str, int]:
        """Calculate workload for each faculty member"""
        workload = {fid: 0 for fid in faculty.keys()}
        
        for slot in timetable_slots:
            if slot.faculty_id in workload:
                workload[slot.faculty_id] += slot.duration // 60
        
        return workload
    
    def _calculate_room_utilization(self, timetable_slots: List[TimetableSlot], rooms: Dict, time_slots: List) -> Dict[str, float]:
        """Calculate room utilization percentage"""
        total_available_hours = len(time_slots) * 5  # 5 days a week
        utilization = {}
        
        for room_id in rooms:
            used_hours = sum(1 for slot in timetable_slots if slot.room_id == room_id)
            utilization[room_id] = (used_hours / total_available_hours) * 100 if total_available_hours > 0 else 0
        
        return utilization